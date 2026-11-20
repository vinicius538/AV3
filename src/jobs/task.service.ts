import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/db";
import { executarAnalise, type ParametrosAnalise, type TipoAnaliseApi } from "../analytics/analysis.service";
import { enfileirarTarefa } from "./queue";

export async function criarTarefa(args: {
  tipo: TipoAnaliseApi;
  parametros: ParametrosAnalise;
  usuarioId?: string;
  parceiroId?: string;
  chaveApiId?: string;
  idempotencia?: string;
}) {
  if (args.idempotencia) {
    const existing = await prisma.tarefaAssincrona.findUnique({ where: { idempotencia: args.idempotencia } });
    if (existing) return { tarefa: existing, jaExistia: true };
  }
  let task;
  try {
    task = await prisma.tarefaAssincrona.create({ data: {
      tipo: args.tipo,
      parametros: JSON.parse(JSON.stringify(args.parametros)),
      usuarioId: args.usuarioId,
      parceiroId: args.parceiroId,
      chaveApiId: args.chaveApiId,
      idempotencia: args.idempotencia,
    } });
  } catch (error) {
    const raced = args.idempotencia ? await prisma.tarefaAssincrona.findUnique({ where: { idempotencia: args.idempotencia } }) : null;
    if (!raced) throw error;
    return { tarefa: raced, jaExistia: true };
  }
  try {
    await enfileirarTarefa(task.id);
  } catch (error) {
    // The row remains pending; a worker startup reconciles pending rows against Redis.
    return { tarefa: task, jaExistia: false, filaIndisponivel: error instanceof Error ? error.message : "Fila indisponível." };
  }
  return { tarefa: task, jaExistia: false };
}

function flatten(value: unknown, prefix = "", out: Record<string, unknown> = {}) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, out);
  } else if (!Array.isArray(value)) out[prefix || "valor"] = value;
  return out;
}

function csvContent(result: unknown) {
  let rows: unknown[] = Array.isArray(result) ? result : [];
  if (!rows.length && result && typeof result === "object") {
    const entries = Object.entries(result as Record<string, unknown>);
    const summary = Object.fromEntries(entries.filter(([, value]) => !Array.isArray(value)));
    rows = Object.keys(summary).length ? [{ secao: "resumo", ...summary }] : [];
    for (const [section, value] of entries) {
      if (Array.isArray(value)) rows.push(...value.map((row) => ({ secao: section, ...(row && typeof row === "object" ? row as object : { valor: row }) })));
    }
    if (!rows.length) rows = [result];
  }
  if (Array.isArray(result) && result.length === 0) rows = [{ resultado: "sem dados" }];
  const flattened = rows.map((row) => flatten(row));
  const columns = [...new Set(flattened.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown) => {
    let content = String(value ?? "");
    if (/^[=+\-@\t\r]/.test(content)) content = `'${content}`;
    return `"${content.replaceAll('"', '""')}"`;
  };
  return [columns.map(escape).join(","), ...flattened.map((row) => columns.map((column) => escape(row[column])).join(","))].join("\r\n");
}

export async function processarTarefa(taskId: string) {
  const task = await prisma.tarefaAssincrona.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("Tarefa não encontrada.");
  if (task.status === "CONCLUIDA") return;
  await prisma.tarefaAssincrona.update({ where: { id: taskId }, data: { status: "EM_EXECUCAO", iniciadaEm: task.iniciadaEm ?? new Date(), progresso: 10, erro: null } });
  let generatedFilePath: string | undefined;
  try {
    const params = task.parametros as unknown as ParametrosAnalise;
    const previousRun = task.execucaoId ? await prisma.execucaoAnalitica.findUnique({ where: { id: task.execucaoId } }) : null;
    const run = previousRun
      ? { execucaoId: previousRun.id, tipo: previousRun.tipo, resultado: previousRun.resultado }
      : await executarAnalise(task.tipo as TipoAnaliseApi, params, task.usuarioId ?? undefined, task.parceiroId ?? undefined, taskId);
    await prisma.tarefaAssincrona.update({ where: { id: taskId }, data: { progresso: 85 } });

    const format = params.formato ?? "json";
    const directory = resolve(process.env.REPORTS_DIR ?? ".data/reports");
    await mkdir(directory, { recursive: true });
    const filename = `${randomUUID()}.${format}`;
    const contents = format === "csv" ? csvContent(run.resultado) : JSON.stringify(run.resultado, null, 2);
    const fullPath = join(directory, filename);
    generatedFilePath = fullPath;
    await writeFile(fullPath, contents, { encoding: "utf8", flag: "wx" });
    const checksum = createHash("sha256").update(contents).digest("hex");
    const expiresAt = new Date(Date.now() + Number(process.env.REPORT_RETENTION_DAYS ?? 7) * 86_400_000);
    await prisma.$transaction(async (tx) => {
      await tx.tarefaAssincrona.update({ where: { id: taskId }, data: {
        status: "CONCLUIDA", progresso: 100, concluidaEm: new Date(), execucaoId: run.execucaoId,
      } });
      await tx.relatorioGerado.upsert({
        where: { tarefaId: taskId },
        create: { tarefaId: taskId, formato: format, caminho: basename(fullPath), checksum, expiraEm: expiresAt },
        update: { formato: format, caminho: basename(fullPath), checksum, criadoEm: new Date(), expiraEm: expiresAt },
      });
    });
  } catch (error) {
    if (generatedFilePath) await unlink(generatedFilePath).catch(() => undefined);
    throw error;
  }
}
