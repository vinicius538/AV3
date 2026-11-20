import type { FastifyInstance } from "fastify";
import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";
import { autenticarApiKey, exigirEscopo, exigirOrganizacaoPermitida } from "../auth/api-key";
import { criarTarefa } from "../jobs/task.service";
import { prisma } from "../lib/db";
import { validarDataEntradaLote } from "../services/regras-de-negocio";

const apiKeySecurity = [{ ApiKeyAuth: [] }];
const errorResponse = { type: "object", additionalProperties: true };

function tarefaDentroDoEscopo(parametros: unknown, organizationIds: string[]) {
  if (!parametros || typeof parametros !== "object" || !("organizacaoId" in parametros)) return false;
  const organizationId = (parametros as { organizacaoId?: unknown }).organizacaoId;
  return typeof organizationId === "string" && organizationIds.includes(organizationId);
}

export async function publicApiRoutes(app: FastifyInstance) {
  const rateLimit = app.rateLimit({
    max: Number(process.env.PUBLIC_API_RATE_LIMIT ?? 100),
    timeWindow: process.env.PUBLIC_API_RATE_WINDOW ?? "1 minute",
    keyGenerator: (request) => request.apiPrincipal?.keyId ?? request.ip,
  });

  app.get<{ Params: { code: string } }>("/api/v1/public/traceability/:code", {
    onRequest: autenticarApiKey,
    preHandler: [exigirEscopo("rastreabilidade:read"), rateLimit],
    schema: {
      tags: ["API pública v1"], summary: "Consulta a rastreabilidade de um equipamento", security: apiKeySecurity,
      params: { type: "object", required: ["code"], properties: { code: { type: "string", minLength: 1, maxLength: 100 } } },
      response: { 200: { type: "object", additionalProperties: true }, 401: errorResponse, 403: errorResponse, 404: errorResponse, 429: errorResponse },
    },
  }, async (request, reply) => {
    const principal = request.apiPrincipal!;
    const equipment = await prisma.equipamento.findFirst({
      where: { codigoBarrasInterno: request.params.code, lote: { organizacaoId: { in: principal.organizationIds } } },
      select: {
        id: true, codigoBarrasInterno: true, tipo: true, marca: true, modelo: true, estadoFisico: true,
        statusRastreamento: true, triagemCompleta: true,
        lote: { select: { id: true, dataEntrada: true, statusProcessamento: true, organizacaoId: true } },
        movimentacoes: { orderBy: { dataHora: "asc" }, select: { dataHora: true, origem: true, destino: true, observacao: true } },
      },
    });
    if (!equipment) return reply.code(404).send({ codigo: "RECURSO_NAO_ENCONTRADO", mensagem: "Equipamento não encontrado." });
    await prisma.auditoriaApi.create({ data: {
      chaveApiId: principal.keyId, operacao: "CONSULTAR_RASTREABILIDADE", entidade: `equipamentos/${equipment.id}`,
      detalhes: { organizacaoId: equipment.lote.organizacaoId },
    } });
    return equipment;
  });

  app.post<{ Params: { organizationId: string }; Body: { dataEntrada: string; notaFiscal: string; transportadora: string; observacoes?: string } }>("/api/v1/public/organizations/:organizationId/lots", {
    onRequest: autenticarApiKey,
    preHandler: [exigirEscopo("lotes:write"), rateLimit],
    schema: {
      tags: ["API pública v1"], summary: "Submete um lote para organização autorizada", security: apiKeySecurity,
      params: { type: "object", required: ["organizationId"], properties: { organizationId: { type: "string", minLength: 1, maxLength: 36 } } },
      body: { type: "object", additionalProperties: false, required: ["dataEntrada", "notaFiscal", "transportadora"], properties: {
        dataEntrada: { type: "string", format: "date-time" }, notaFiscal: { type: "string", minLength: 1, maxLength: 100 },
        transportadora: { type: "string", minLength: 1, maxLength: 150 }, observacoes: { type: "string", maxLength: 5_000 },
      } },
      response: { 201: { type: "object", additionalProperties: true }, 401: errorResponse, 403: errorResponse, 404: errorResponse, 422: errorResponse, 429: errorResponse },
    },
  }, async (request, reply) => {
    const principal = request.apiPrincipal!;
    if (!exigirOrganizacaoPermitida(request, reply, request.params.organizationId)) return;
    const dataEntrada = new Date(request.body.dataEntrada);
    try { validarDataEntradaLote(dataEntrada); }
    catch (error) { return reply.code(422).send({ codigo: "LOTE_INVALIDO", mensagem: error instanceof Error ? error.message : "Data de entrada inválida." }); }
    const organization = await prisma.organizacao.findFirst({ where: { id: request.params.organizationId, ativo: true } });
    if (!organization) return reply.code(404).send({ codigo: "RECURSO_NAO_ENCONTRADO", mensagem: "Organização não encontrada." });
    const externalRef = request.headers["idempotency-key"];
    if (typeof externalRef === "string" && externalRef.length > 100) return reply.code(400).send({ codigo: "IDEMPOTENCIA_INVALIDA", mensagem: "Idempotency-Key deve ter até 100 caracteres." });
    const idempotencia = typeof externalRef === "string" ? `${principal.keyId}:${externalRef}` : undefined;
    if (idempotencia) {
      const found = await prisma.auditoriaApi.findFirst({ where: { chaveApiId: principal.keyId, operacao: "SUBMETER_LOTE", idempotencia } });
      if (found?.entidade.startsWith("lotes/")) {
        const existing = await prisma.lote.findUnique({ where: { id: found.entidade.slice("lotes/".length) } });
        if (existing) return reply.code(201).send(existing);
      }
    }
    let lote;
    try {
      lote = await prisma.$transaction(async (tx) => {
        const created = await tx.lote.create({ data: {
          dataEntrada,
          notaFiscal: request.body.notaFiscal,
          transportadora: request.body.transportadora,
          observacoes: request.body.observacoes,
          organizacaoId: organization.id,
        } });
        await tx.eventoTriagem.create({ data: { loteId: created.id, statusAnterior: null, statusNovo: "RECEBIDO" } });
        await tx.auditoriaApi.create({ data: {
          chaveApiId: principal.keyId, operacao: "SUBMETER_LOTE", entidade: `lotes/${created.id}`, idempotencia,
          detalhes: { organizacaoId: organization.id },
        } });
        return created;
      });
    } catch (error) {
      if (!idempotencia || (error as { code?: string }).code !== "P2002") throw error;
      const found = await prisma.auditoriaApi.findFirst({ where: { chaveApiId: principal.keyId, operacao: "SUBMETER_LOTE", idempotencia } });
      const existing = found?.entidade.startsWith("lotes/") ? await prisma.lote.findUnique({ where: { id: found.entidade.slice("lotes/".length) } }) : null;
      if (!existing) throw error;
      return reply.code(201).send(existing);
    }
    return reply.code(201).send(lote);
  });

  app.post<{ Body: { analysisType: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "RUL"; organizationId: string; inicio?: string; fim?: string; metrica?: string; limiar?: number; formato?: "json" | "csv" } }>("/api/v1/public/analytics/reports", {
    onRequest: autenticarApiKey,
    preHandler: [exigirEscopo("relatorios:read"), rateLimit],
    schema: {
      tags: ["API pública v1"], summary: "Solicita relatório analítico assíncrono", security: apiKeySecurity,
      body: { type: "object", additionalProperties: false, required: ["analysisType", "organizationId"], properties: {
        analysisType: { type: "string", enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE", "RUL"] },
        organizationId: { type: "string", minLength: 1, maxLength: 36 },
        inicio: { type: "string", format: "date-time" }, fim: { type: "string", format: "date-time" },
        metrica: { type: "string", minLength: 1, maxLength: 80 }, limiar: { type: "number" }, formato: { type: "string", enum: ["json", "csv"] },
      } },
      response: { 202: { type: "object", additionalProperties: true }, 401: errorResponse, 403: errorResponse, 404: errorResponse, 429: errorResponse },
    },
  }, async (request, reply) => {
    const principal = request.apiPrincipal!;
    if (!exigirOrganizacaoPermitida(request, reply, request.body.organizationId)) return;
    if (request.body.fim && request.body.inicio && new Date(request.body.fim) < new Date(request.body.inicio)) {
      return reply.code(400).send({ codigo: "PERIODO_INVALIDO", mensagem: "fim deve ser posterior ou igual a inicio." });
    }
    if (request.body.analysisType === "RUL" && (request.body.metrica === undefined || request.body.limiar === undefined)) {
      return reply.code(400).send({ codigo: "PARAMETROS_RUL", mensagem: "RUL exige metrica e limiar." });
    }
    const externalRef = request.headers["idempotency-key"];
    if (typeof externalRef === "string" && externalRef.length > 100) return reply.code(400).send({ codigo: "IDEMPOTENCIA_INVALIDA", mensagem: "Idempotency-Key deve ter até 100 caracteres." });
    const { analysisType, organizationId, ...params } = request.body;
    const result = await criarTarefa({
      tipo: analysisType,
      parametros: { ...params, organizacaoId: organizationId },
      parceiroId: principal.partnerId,
      chaveApiId: principal.keyId,
      idempotencia: typeof externalRef === "string" ? `${principal.keyId}:${externalRef}` : undefined,
    });
    await prisma.auditoriaApi.create({ data: { chaveApiId: principal.keyId, operacao: "SOLICITAR_RELATORIO", entidade: `tarefas/${result.tarefa.id}`, detalhes: { organizationId, analysisType } } });
    return reply.code(202).send({ taskId: result.tarefa.id, status: result.tarefa.status, statusUrl: `/api/v1/public/jobs/${result.tarefa.id}` });
  });

  app.get<{ Querystring: { organizationId?: string; analysisType?: "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "RUL" } }>("/api/v1/public/analytics/reports", {
    onRequest: autenticarApiKey,
    preHandler: [exigirEscopo("relatorios:read"), rateLimit],
    schema: { tags: ["API pública v1"], summary: "Consulta relatórios analíticos históricos", security: apiKeySecurity,
      querystring: { type: "object", additionalProperties: false, properties: {
        organizationId: { type: "string", minLength: 1, maxLength: 36 }, analysisType: { type: "string", enum: ["EFICIENCIA_OPERACIONAL", "RENTABILIDADE", "RUL"] },
      } },
    },
  }, async (request, reply) => {
    const principal = request.apiPrincipal!;
    if (request.query.organizationId && !exigirOrganizacaoPermitida(request, reply, request.query.organizationId)) return;
    return prisma.execucaoAnalitica.findMany({
      where: {
        parceiroId: principal.partnerId,
        organizacaoId: request.query.organizationId ? request.query.organizationId : { in: principal.organizationIds },
        ...(request.query.analysisType ? { tipo: request.query.analysisType } : {}),
      },
      orderBy: { concluidaEm: "desc" }, take: 100,
      select: { id: true, tipo: true, parametros: true, iniciadaEm: true, concluidaEm: true, organizacaoId: true, versaoMetodo: true },
    });
  });

  app.get<{ Params: { runId: string } }>("/api/v1/public/analytics/reports/:runId", {
    onRequest: autenticarApiKey,
    preHandler: [exigirEscopo("relatorios:read"), rateLimit],
    schema: { tags: ["API pública v1"], summary: "Consulta o conteúdo de um relatório histórico", security: apiKeySecurity,
      params: { type: "object", required: ["runId"], properties: { runId: { type: "string", minLength: 1, maxLength: 36 } } },
    },
  }, async (request, reply) => {
    const principal = request.apiPrincipal!;
    const run = await prisma.execucaoAnalitica.findFirst({
      where: { id: request.params.runId, parceiroId: principal.partnerId, organizacaoId: { in: principal.organizationIds } },
      include: { previsoes: { select: { equipamentoId: true, metodo: true, valorEstimadoDias: true, dataAlvo: true, corteDados: true, falhaRealEm: true, erroDias: true } } },
    });
    if (!run) return reply.code(404).send({ codigo: "RELATORIO_NAO_ENCONTRADO", mensagem: "Relatório não encontrado." });
    return run;
  });

  app.get<{ Params: { taskId: string } }>("/api/v1/public/jobs/:taskId", {
    onRequest: autenticarApiKey,
    preHandler: [exigirEscopo("relatorios:read"), rateLimit],
    schema: { tags: ["API pública v1"], summary: "Consulta o estado de um job", security: apiKeySecurity,
      params: { type: "object", required: ["taskId"], properties: { taskId: { type: "string", minLength: 1, maxLength: 36 } } },
      response: { 200: { type: "object", additionalProperties: true }, 401: errorResponse, 403: errorResponse, 404: errorResponse, 429: errorResponse },
    },
  }, async (request, reply) => {
    const task = await prisma.tarefaAssincrona.findFirst({
      where: { id: request.params.taskId, parceiroId: request.apiPrincipal!.partnerId },
      include: { relatorio: true },
    });
    if (!task || !tarefaDentroDoEscopo(task.parametros, request.apiPrincipal!.organizationIds)) return reply.code(404).send({ codigo: "TAREFA_NAO_ENCONTRADA", mensagem: "Tarefa não encontrada." });
    return {
      taskId: task.id, status: task.status, progresso: task.progresso,
      erro: task.status === "FALHA_FINAL" ? "A tarefa falhou. Consulte o administrador para obter mais informações." : null,
      criadaEm: task.criadaEm, iniciadaEm: task.iniciadaEm, concluidaEm: task.concluidaEm,
      downloadUrl: task.relatorio && task.relatorio.expiraEm > new Date() ? `/api/v1/public/jobs/${task.id}/download` : null,
    };
  });

  app.get<{ Params: { taskId: string } }>("/api/v1/public/jobs/:taskId/download", {
    onRequest: autenticarApiKey,
    preHandler: [exigirEscopo("relatorios:read"), rateLimit],
    schema: { tags: ["API pública v1"], summary: "Baixa o relatório gerado", security: apiKeySecurity,
      params: { type: "object", required: ["taskId"], properties: { taskId: { type: "string", minLength: 1, maxLength: 36 } } },
      response: { 200: { type: "string", format: "binary" }, 401: errorResponse, 403: errorResponse, 404: errorResponse, 410: errorResponse, 429: errorResponse },
    },
  }, async (request, reply) => {
    const task = await prisma.tarefaAssincrona.findFirst({ where: { id: request.params.taskId, parceiroId: request.apiPrincipal!.partnerId }, include: { relatorio: true } });
    if (!task?.relatorio || !tarefaDentroDoEscopo(task.parametros, request.apiPrincipal!.organizationIds)) return reply.code(404).send({ codigo: "RELATORIO_NAO_ENCONTRADO", mensagem: "Relatório não encontrado." });
    if (task.relatorio.expiraEm <= new Date()) return reply.code(410).send({ codigo: "RELATORIO_EXPIRADO", mensagem: "O relatório expirou." });
    await prisma.auditoriaApi.create({ data: { chaveApiId: request.apiPrincipal!.keyId, operacao: "BAIXAR_RELATORIO", entidade: `tarefas/${task.id}` } });
    const root = resolve(process.env.REPORTS_DIR ?? ".data/reports");
    const path = join(root, task.relatorio.caminho);
    reply.header("content-type", task.relatorio.formato === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
    reply.header("content-disposition", `attachment; filename="greencode-${task.id}.${task.relatorio.formato}"`);
    return reply.send(createReadStream(path));
  });
}
