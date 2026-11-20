import type { FastifyInstance } from "fastify";
import { autorizarPapeis, exigirUsuarioAutenticado } from "../auth/autenticacao";
import { executarComJournal } from "../services/journal.service";
import { prisma } from "../lib/db";

export async function analyticsInputRoutes(app: FastifyInstance) {
  app.post<{ Params: { equipmentId: string }; Body: { occurredAt?: string; metric: string; value: number; unit: string; physicalState?: "NOVO" | "BOM" | "REGULAR" | "RUIM" | "INSERVIVEL"; note?: string } }>("/api/v1/internal/equipment/:equipmentId/observations", {
    onRequest: autorizarPapeis("ADMINISTRADOR", "GESTOR_ALMOXARIFADO"),
    schema: { tags: ["Dados analíticos"], security: [{ BearerAuth: [] }],
      params: { type: "object", required: ["equipmentId"], properties: { equipmentId: { type: "string", minLength: 1, maxLength: 36 } } },
      body: { type: "object", additionalProperties: false, required: ["metric", "value", "unit"], properties: {
        occurredAt: { type: "string", format: "date-time" }, metric: { type: "string", minLength: 1, maxLength: 80 },
        value: { type: "number" }, unit: { type: "string", minLength: 1, maxLength: 30 },
        physicalState: { type: "string", enum: ["NOVO", "BOM", "REGULAR", "RUIM", "INSERVIVEL"] }, note: { type: "string", maxLength: 5_000 },
      } },
    },
  }, async (request, reply) => {
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    const equipment = await prisma.equipamento.findUnique({ where: { id: request.params.equipmentId }, select: { id: true } });
    if (!equipment) return reply.code(404).send({ codigo: "EQUIPAMENTO_NAO_ENCONTRADO", mensagem: "Equipamento não encontrado." });
    const sameMetric = await prisma.observacaoEquipamento.findFirst({ where: { metrica: request.body.metric }, select: { unidade: true } });
    if (sameMetric && sameMetric.unidade !== request.body.unit) return reply.code(422).send({ codigo: "UNIDADE_INCONSISTENTE", mensagem: "A unidade precisa permanecer igual para a mesma métrica do equipamento." });
    const observation = await executarComJournal(async (tx) => {
      const created = await tx.observacaoEquipamento.create({ data: {
        equipamentoId: equipment.id, operadorId: actor.id, ocorridoEm: request.body.occurredAt ? new Date(request.body.occurredAt) : new Date(),
        metrica: request.body.metric, valor: request.body.value, unidade: request.body.unit,
        estadoFisico: request.body.physicalState, observacao: request.body.note,
      } });
      return { resultado: created, evento: { usuarioResponsavel: actor.id, operacao: "REGISTRAR_OBSERVACAO", entidade: `equipamentos/${equipment.id}`, dadosDepois: created } };
    });
    return reply.code(201).send(observation);
  });

  app.post<{ Params: { equipmentId: string }; Body: { occurredAt?: string; description: string; inservible?: boolean; repairedAt?: string } }>("/api/v1/internal/equipment/:equipmentId/failures", {
    onRequest: autorizarPapeis("ADMINISTRADOR", "GESTOR_ALMOXARIFADO"),
    schema: { tags: ["Dados analíticos"], security: [{ BearerAuth: [] }],
      params: { type: "object", required: ["equipmentId"], properties: { equipmentId: { type: "string", minLength: 1, maxLength: 36 } } },
      body: { type: "object", additionalProperties: false, required: ["description"], properties: {
        occurredAt: { type: "string", format: "date-time" }, description: { type: "string", minLength: 1, maxLength: 5_000 },
        inservible: { type: "boolean" }, repairedAt: { type: "string", format: "date-time" },
      } },
    },
  }, async (request, reply) => {
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    const equipment = await prisma.equipamento.findUnique({ where: { id: request.params.equipmentId } });
    if (!equipment) return reply.code(404).send({ codigo: "EQUIPAMENTO_NAO_ENCONTRADO", mensagem: "Equipamento não encontrado." });
    const occurredAt = request.body.occurredAt ? new Date(request.body.occurredAt) : new Date();
    const inservible = request.body.inservible ?? false;
    const failure = await executarComJournal(async (tx) => {
      const created = await tx.falhaEquipamento.create({ data: {
        equipamentoId: equipment.id, ocorridoEm: occurredAt, descricao: request.body.description,
        inservivel: inservible, reparadoEm: request.body.repairedAt ? new Date(request.body.repairedAt) : undefined,
      } });
      let after = equipment;
      if (inservible) {
        const updated = await tx.equipamento.updateMany({ where: { id: equipment.id, versao: equipment.versao }, data: {
          estadoFisico: "INSERVIVEL", statusRastreamento: "DESCARTADO", versao: { increment: 1 },
        } });
        if (!updated.count) throw new Error("O equipamento foi alterado simultaneamente; recarregue o registro e tente novamente.");
        after = (await tx.equipamento.findUnique({ where: { id: equipment.id } })) ?? equipment;
        const forecasts = await tx.previsaoRul.findMany({ where: { equipamentoId: equipment.id, falhaRealEm: null, corteDados: { lt: occurredAt } } });
        for (const forecast of forecasts) {
          const actualDays = (occurredAt.getTime() - forecast.corteDados.getTime()) / 86_400_000;
          await tx.previsaoRul.update({ where: { id: forecast.id }, data: { falhaRealEm: occurredAt, erroDias: Number(forecast.valorEstimadoDias) - actualDays } });
        }
      }
      return { resultado: created, evento: { usuarioResponsavel: actor.id, operacao: "REGISTRAR_FALHA", entidade: `equipamentos/${equipment.id}`, dadosAntes: equipment, dadosDepois: { equipamento: after, falha: created } } };
    });
    return reply.code(201).send(failure);
  });

  app.post<{ Params: { equipmentId: string }; Body: { material: string; quantity: number; unit: string; unitPrice: number; currency?: string; priceSource: string; evaluatedAt?: string } }>("/api/v1/internal/equipment/:equipmentId/recovered-materials", {
    onRequest: autorizarPapeis("ADMINISTRADOR", "GESTOR_ALMOXARIFADO"),
    schema: { tags: ["Dados analíticos"], security: [{ BearerAuth: [] }],
      params: { type: "object", required: ["equipmentId"], properties: { equipmentId: { type: "string", minLength: 1, maxLength: 36 } } },
      body: { type: "object", additionalProperties: false, required: ["material", "quantity", "unit", "unitPrice", "priceSource"], properties: {
        material: { type: "string", minLength: 1, maxLength: 100 }, quantity: { type: "number", exclusiveMinimum: 0 },
        unit: { type: "string", minLength: 1, maxLength: 30 }, unitPrice: { type: "number", minimum: 0 },
        currency: { type: "string", minLength: 3, maxLength: 3 }, priceSource: { type: "string", minLength: 1, maxLength: 200 }, evaluatedAt: { type: "string", format: "date-time" },
      } },
    },
  }, async (request, reply) => {
    const equipment = await prisma.equipamento.findUnique({ where: { id: request.params.equipmentId }, select: { id: true } });
    if (!equipment) return reply.code(404).send({ codigo: "EQUIPAMENTO_NAO_ENCONTRADO", mensagem: "Equipamento não encontrado." });
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    const row = await executarComJournal(async (tx) => {
      const created = await tx.materialRecuperado.create({ data: {
        equipamentoId: equipment.id, material: request.body.material, quantidade: request.body.quantity, unidade: request.body.unit,
        precoUnitario: request.body.unitPrice, moeda: request.body.currency ?? "BRL", fontePreco: request.body.priceSource,
        avaliadoEm: request.body.evaluatedAt ? new Date(request.body.evaluatedAt) : new Date(),
      } });
      return { resultado: created, evento: { usuarioResponsavel: actor.id, operacao: "REGISTRAR_RECUPERACAO", entidade: `equipamentos/${equipment.id}`, dadosDepois: created } };
    });
    return reply.code(201).send(row);
  });

  app.post<{ Params: { equipmentId: string }; Body: { category: string; amount: number; currency?: string; description?: string; occurredAt?: string } }>("/api/v1/internal/equipment/:equipmentId/recovery-costs", {
    onRequest: autorizarPapeis("ADMINISTRADOR", "GESTOR_ALMOXARIFADO"),
    schema: { tags: ["Dados analíticos"], security: [{ BearerAuth: [] }],
      params: { type: "object", required: ["equipmentId"], properties: { equipmentId: { type: "string", minLength: 1, maxLength: 36 } } },
      body: { type: "object", additionalProperties: false, required: ["category", "amount"], properties: {
        category: { type: "string", minLength: 1, maxLength: 80 }, amount: { type: "number", minimum: 0 },
        currency: { type: "string", minLength: 3, maxLength: 3 }, description: { type: "string", maxLength: 5_000 }, occurredAt: { type: "string", format: "date-time" },
      } },
    },
  }, async (request, reply) => {
    const equipment = await prisma.equipamento.findUnique({ where: { id: request.params.equipmentId }, select: { id: true } });
    if (!equipment) return reply.code(404).send({ codigo: "EQUIPAMENTO_NAO_ENCONTRADO", mensagem: "Equipamento não encontrado." });
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    const row = await executarComJournal(async (tx) => {
      const created = await tx.custoRecuperacao.create({ data: {
        equipamentoId: equipment.id, categoria: request.body.category, valor: request.body.amount,
        moeda: request.body.currency ?? "BRL", descricao: request.body.description,
        ocorridoEm: request.body.occurredAt ? new Date(request.body.occurredAt) : new Date(),
      } });
      return { resultado: created, evento: { usuarioResponsavel: actor.id, operacao: "REGISTRAR_CUSTO", entidade: `equipamentos/${equipment.id}`, dadosDepois: created } };
    });
    return reply.code(201).send(row);
  });
}
