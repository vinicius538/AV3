import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import cron from "node-cron";
import { unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { prisma } from "../lib/db";
import { QUEUE_NAME, enfileirarTarefa, fecharFila } from "./queue";
import { criarTarefa, processarTarefa } from "./task.service";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL deve estar configurada para iniciar o worker.");
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true });
const worker = new Worker(QUEUE_NAME, async (job) => {
  await processarTarefa(job.data.taskId as string);
  await job.updateProgress(100);
}, { connection, concurrency: Number(process.env.WORKER_CONCURRENCY ?? 2) });

worker.on("failed", async (job, error) => {
  if (!job) return;
  const maxAttempts = Number(job.opts.attempts ?? 1);
  const final = job.attemptsMade >= maxAttempts;
  try {
    await prisma.tarefaAssincrona.updateMany({
      where: { id: job.data.taskId as string, status: { not: "CONCLUIDA" } },
      data: { status: final ? "FALHA_FINAL" : "PENDENTE", erro: error.message.slice(0, 2_000), concluidaEm: final ? new Date() : null },
    });
  } catch (persistError) {
    console.error("Falha ao persistir estado de erro da tarefa", { taskId: job.data.taskId, persistError });
  }
});

worker.on("error", (error) => console.error("Erro no worker BullMQ", error));

async function reconciliarPendentes() {
  const pending = await prisma.tarefaAssincrona.findMany({ where: { status: "PENDENTE" }, select: { id: true }, take: 500, orderBy: { criadaEm: "asc" } });
  for (const task of pending) {
    try { await enfileirarTarefa(task.id); }
    catch (error) { console.error("Não foi possível reenfileirar tarefa pendente", { taskId: task.id, error }); }
  }
}

async function limparRelatoriosExpirados() {
  const expired = await prisma.relatorioGerado.findMany({ where: { expiraEm: { lte: new Date() } }, take: 200 });
  const directory = resolve(process.env.REPORTS_DIR ?? ".data/reports");
  for (const report of expired) {
    try { await unlink(join(directory, report.caminho)); } catch { /* File may already have been removed. */ }
    await prisma.relatorioGerado.delete({ where: { id: report.id } });
  }
}

await reconciliarPendentes();
const cleanupCron = cron.schedule(process.env.REPORT_CLEANUP_CRON ?? "17 3 * * *", () => {
  void limparRelatoriosExpirados().catch((error) => console.error("Falha ao limpar relatórios expirados", error));
});

const analysisCron = process.env.OPERATIONAL_ANALYSIS_CRON;
const analysisSchedule = analysisCron ? cron.schedule(analysisCron, async () => {
  const day = new Date().toISOString().slice(0, 10);
  try {
    await criarTarefa({ tipo: "EFICIENCIA_OPERACIONAL", parametros: { formato: "json" }, idempotencia: `operacional:${day}` });
    // criarTarefa já publica a mensagem; chave idempotente protege ticks repetidos.
  } catch (error) { console.error("Falha ao agendar análise operacional", error); }
}) : null;
const reconcileTimer = setInterval(() => {
  void reconciliarPendentes().catch((error) => console.error("Falha ao reconciliar fila de tarefas", error));
}, 30_000);

console.info("Worker GreenCode AV3 iniciado", { concurrency: process.env.WORKER_CONCURRENCY ?? "2" });

let closing: Promise<void> | undefined;
function shutdown() {
  if (closing) return closing;
  closing = (async () => {
    cleanupCron.stop();
    analysisSchedule?.stop();
    clearInterval(reconcileTimer);
    await worker.close();
    await fecharFila();
    await connection.quit();
    await prisma.$disconnect();
  })();
  return closing;
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
