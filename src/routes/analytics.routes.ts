import type { FastifyInstance } from "fastify";
import { autorizarPapeis, exigirUsuarioAutenticado } from "../auth/autenticacao";
import { consultarExecucoes, type ParametrosAnalise, type TipoAnaliseApi } from "../analytics/analysis.service";
import { criarTarefa } from "../jobs/task.service";
import { prisma } from "../lib/db";

export async function analyticsRoutes(app: FastifyInstance) {
  app.post<{ Params: { kind: TipoAnaliseApi }; Body: ParametrosAnalise }>("/api/v1/internal/analytics/:kind/jobs", {
    onRequest: autorizarPapeis("ADMINISTRADOR", "AUDITOR"),
    schema: {
      tags: ["Análises internas"], summary: "Solicita análise assíncrona", security: [{ BearerAuth: [] }],
      params: { type: "object", required: ["kind"], properties: { kind: { type: "string", enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE", "RUL"] } } },
      body: { type: "object", additionalProperties: false, properties: {
        organizacaoId: { type: "string", minLength: 1, maxLength: 36 },
        inicio: { type: "string", format: "date-time" }, fim: { type: "string", format: "date-time" },
        metrica: { type: "string", minLength: 1, maxLength: 80 }, limiar: { type: "number" },
        formato: { type: "string", enum: ["json", "csv"] },
      } },
      response: { 202: { type: "object", additionalProperties: true }, 400: { type: "object" }, 401: { type: "object" }, 403: { type: "object" } },
    },
  }, async (request, reply) => {
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    if (request.body.fim && request.body.inicio && new Date(request.body.fim) < new Date(request.body.inicio)) {
      return reply.code(400).send({ codigo: "PERIODO_INVALIDO", mensagem: "fim deve ser posterior ou igual a inicio." });
    }
    if (request.params.kind === "RUL" && (request.body.metrica === undefined || request.body.limiar === undefined)) {
      return reply.code(400).send({ codigo: "PARAMETROS_RUL", mensagem: "RUL exige metrica e limiar." });
    }
    const externalRef = request.headers["idempotency-key"];
    if (typeof externalRef === "string" && externalRef.length > 100) return reply.code(400).send({ codigo: "IDEMPOTENCIA_INVALIDA", mensagem: "Idempotency-Key deve ter até 100 caracteres." });
    const created = await criarTarefa({
      tipo: request.params.kind,
      parametros: request.body,
      usuarioId: actor.id,
      idempotencia: typeof externalRef === "string" ? `${actor.id}:${externalRef}` : undefined,
    });
    return reply.code(202).send({ taskId: created.tarefa.id, status: created.tarefa.status, statusUrl: `/api/v1/internal/jobs/${created.tarefa.id}` });
  });

  app.get("/api/v1/internal/analytics/runs", { onRequest: autorizarPapeis("ADMINISTRADOR", "AUDITOR"), schema: { tags: ["Análises internas"], security: [{ BearerAuth: [] }] } }, async () => consultarExecucoes());

  app.get<{ Params: { runId: string } }>("/api/v1/internal/analytics/runs/:runId", {
    onRequest: autorizarPapeis("ADMINISTRADOR", "AUDITOR"),
    schema: { tags: ["Análises internas"], security: [{ BearerAuth: [] }], params: { type: "object", required: ["runId"], properties: { runId: { type: "string", minLength: 1, maxLength: 36 } } } },
  }, async (request, reply) => {
    const run = await prisma.execucaoAnalitica.findUnique({
      where: { id: request.params.runId },
      include: { previsoes: { select: { equipamentoId: true, metodo: true, valorEstimadoDias: true, dataAlvo: true, corteDados: true, falhaRealEm: true, erroDias: true } } },
    });
    if (!run) return reply.code(404).send({ codigo: "ANALISE_NAO_ENCONTRADA", mensagem: "Execução analítica não encontrada." });
    return run;
  });

  app.get<{ Params: { taskId: string } }>("/api/v1/internal/jobs/:taskId", {
    onRequest: autorizarPapeis("ADMINISTRADOR", "AUDITOR"),
    schema: { tags: ["Análises internas"], security: [{ BearerAuth: [] }], params: { type: "object", required: ["taskId"], properties: { taskId: { type: "string", minLength: 1, maxLength: 36 } } } },
  }, async (request, reply) => {
    const task = await prisma.tarefaAssincrona.findUnique({ where: { id: request.params.taskId }, include: { relatorio: true } });
    if (!task || task.parceiroId) return reply.code(404).send({ codigo: "TAREFA_NAO_ENCONTRADA", mensagem: "Tarefa interna não encontrada." });
    return {
      taskId: task.id, tipo: task.tipo, status: task.status, progresso: task.progresso, erro: task.erro,
      criadaEm: task.criadaEm, iniciadaEm: task.iniciadaEm, concluidaEm: task.concluidaEm,
      execucaoId: task.execucaoId,
      downloadUrl: task.relatorio && task.relatorio.expiraEm > new Date() ? `/api/v1/internal/jobs/${task.id}/download` : null,
    };
  });

  app.get<{ Params: { taskId: string } }>("/api/v1/internal/jobs/:taskId/download", {
    onRequest: autorizarPapeis("ADMINISTRADOR", "AUDITOR"),
    schema: { tags: ["Análises internas"], security: [{ BearerAuth: [] }], params: { type: "object", required: ["taskId"], properties: { taskId: { type: "string", minLength: 1, maxLength: 36 } } } },
  }, async (request, reply) => {
    const task = await prisma.tarefaAssincrona.findUnique({ where: { id: request.params.taskId }, include: { relatorio: true } });
    if (!task || task.parceiroId || !task.relatorio) return reply.code(404).send({ codigo: "RELATORIO_NAO_ENCONTRADO", mensagem: "Relatório não encontrado." });
    if (task.relatorio.expiraEm <= new Date()) return reply.code(410).send({ codigo: "RELATORIO_EXPIRADO", mensagem: "O relatório expirou." });
    const { createReadStream } = await import("node:fs");
    const { join, resolve } = await import("node:path");
    const path = join(resolve(process.env.REPORTS_DIR ?? ".data/reports"), task.relatorio.caminho);
    reply.header("content-type", task.relatorio.formato === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="greencode-${task.id}.${task.relatorio.formato}"`);
    return reply.send(createReadStream(path));
  });
}
