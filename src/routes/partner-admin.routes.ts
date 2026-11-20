import type { FastifyInstance } from "fastify";
import { autorizarPapeis, exigirUsuarioAutenticado } from "../auth/autenticacao";
import { criarChaveApi } from "../auth/api-key";
import { prisma } from "../lib/db";

const escoposValidos = ["rastreabilidade:read", "lotes:write", "relatorios:read"];
const adminSecurity = [{ BearerAuth: [] }];

export async function partnerAdminRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/partners", { onRequest: autorizarPapeis("ADMINISTRADOR"), schema: { tags: ["Administração"], security: adminSecurity } }, async () => {
    return prisma.parceiroApi.findMany({
      orderBy: { criadoEm: "desc" },
      include: { organizacoes: { select: { organizacaoId: true } }, chaves: { select: { id: true, prefixo: true, escopos: true, criadaEm: true, expiraEm: true, revogadaEm: true, ultimoUsoEm: true } } },
    });
  });

  app.patch<{ Params: { partnerId: string }; Body: { ativo?: boolean; organizacaoIds?: string[] } }>("/api/v1/admin/partners/:partnerId", {
    onRequest: autorizarPapeis("ADMINISTRADOR"),
    schema: {
      tags: ["Administração"], security: adminSecurity,
      params: { type: "object", required: ["partnerId"], properties: { partnerId: { type: "string", minLength: 1, maxLength: 36 } } },
      body: { type: "object", additionalProperties: false, minProperties: 1, properties: {
        ativo: { type: "boolean" }, organizacaoIds: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 36 } },
      } },
    },
  }, async (request, reply) => {
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    const before = await prisma.parceiroApi.findUnique({ where: { id: request.params.partnerId }, include: { organizacoes: true } });
    if (!before) return reply.code(404).send({ codigo: "PARCEIRO_NAO_ENCONTRADO", mensagem: "Parceiro não encontrado." });
    const updated = await prisma.$transaction(async (tx) => {
      if (request.body.organizacaoIds) {
        const active = await tx.organizacao.findMany({ where: { id: { in: request.body.organizacaoIds }, ativo: true }, select: { id: true } });
        if (active.length !== new Set(request.body.organizacaoIds).size) return null;
        await tx.acessoParceiroOrganizacao.deleteMany({ where: { parceiroId: before.id } });
        if (active.length) await tx.acessoParceiroOrganizacao.createMany({ data: active.map(({ id }) => ({ parceiroId: before.id, organizacaoId: id })) });
      }
      const partner = await tx.parceiroApi.update({ where: { id: before.id }, data: { ativo: request.body.ativo } });
      await tx.journalTransacao.create({ data: {
        usuarioResponsavel: actor.id, operacao: "ATUALIZAR_PARCEIRO_API", entidade: `parceiros_api/${before.id}`,
        dadosAntes: { ativo: before.ativo, organizacaoIds: before.organizacoes.map((item) => item.organizacaoId) },
        dadosDepois: { ativo: partner.ativo, organizacaoIds: request.body.organizacaoIds ?? before.organizacoes.map((item) => item.organizacaoId) },
      } });
      return partner;
    });
    if (!updated) return reply.code(422).send({ codigo: "ORGANIZACAO_INVALIDA", mensagem: "Uma ou mais organizações não existem ou estão inativas." });
    return updated;
  });

  app.post<{ Body: { nome: string; organizacaoIds: string[] } }>("/api/v1/admin/partners", {
    onRequest: autorizarPapeis("ADMINISTRADOR"),
    schema: {
      tags: ["Administração"], security: adminSecurity,
      body: { type: "object", additionalProperties: false, required: ["nome", "organizacaoIds"], properties: {
        nome: { type: "string", minLength: 1, maxLength: 150 },
        organizacaoIds: { type: "array", uniqueItems: true, items: { type: "string", minLength: 1, maxLength: 36 } },
      } },
    },
  }, async (request, reply) => {
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    const result = await prisma.$transaction(async (tx) => {
      const active = await tx.organizacao.findMany({ where: { id: { in: request.body.organizacaoIds }, ativo: true }, select: { id: true } });
      if (active.length !== new Set(request.body.organizacaoIds).size) return null;
      const partner = await tx.parceiroApi.create({ data: { nome: request.body.nome } });
      if (active.length) await tx.acessoParceiroOrganizacao.createMany({ data: active.map(({ id }) => ({ parceiroId: partner.id, organizacaoId: id })) });
      await tx.journalTransacao.create({ data: {
        usuarioResponsavel: actor.id, operacao: "CRIAR", entidade: `parceiros_api/${partner.id}`,
        dadosDepois: { id: partner.id, nome: partner.nome, organizacaoIds: active.map(({ id }) => id) },
      } });
      return partner;
    });
    if (!result) return reply.code(422).send({ codigo: "ORGANIZACAO_INVALIDA", mensagem: "Uma ou mais organizações não existem ou estão inativas." });
    return reply.code(201).send(result);
  });

  app.post<{ Params: { partnerId: string }; Body: { scopes: string[]; expiresAt?: string } }>("/api/v1/admin/partners/:partnerId/keys", {
    onRequest: autorizarPapeis("ADMINISTRADOR"),
    schema: {
      tags: ["Administração"], security: adminSecurity,
      params: { type: "object", required: ["partnerId"], properties: { partnerId: { type: "string", minLength: 1, maxLength: 36 } } },
      body: { type: "object", additionalProperties: false, required: ["scopes"], properties: {
        scopes: { type: "array", minItems: 1, uniqueItems: true, items: { type: "string", enum: escoposValidos } },
        expiresAt: { type: "string", format: "date-time" },
      } },
    },
  }, async (request, reply) => {
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    const partner = await prisma.parceiroApi.findUnique({ where: { id: request.params.partnerId } });
    if (!partner || !partner.ativo) return reply.code(404).send({ codigo: "PARCEIRO_NAO_ENCONTRADO", mensagem: "Parceiro não encontrado." });
    if (request.body.expiresAt && new Date(request.body.expiresAt) <= new Date()) {
      return reply.code(400).send({ codigo: "VALIDACAO", mensagem: "A expiração precisa estar no futuro." });
    }
    let created;
    try {
      created = await prisma.$transaction(async (tx) => {
        const key = await criarChaveApi(partner.id, request.body.scopes, request.body.expiresAt ? new Date(request.body.expiresAt) : undefined, tx);
        await tx.journalTransacao.create({ data: {
          usuarioResponsavel: actor.id, operacao: "CRIAR_CHAVE", entidade: `chaves_api/${key.id}`,
          dadosDepois: { parceiroId: partner.id, prefixo: key.prefixo, escopos: key.escopos, expiraEm: key.expiraEm },
        } });
        return key;
      });
    }
    catch (error) {
      if (error instanceof Error && error.message.includes("API_KEY_PEPPER")) return reply.code(503).send({ codigo: "INTEGRACAO_INDISPONIVEL", mensagem: "Configure API_KEY_PEPPER antes de emitir chaves." });
      throw error;
    }
    return reply.code(201).send(created);
  });

  app.delete<{ Params: { keyId: string } }>("/api/v1/admin/keys/:keyId", {
    onRequest: autorizarPapeis("ADMINISTRADOR"),
    schema: { tags: ["Administração"], security: adminSecurity, params: { type: "object", required: ["keyId"], properties: { keyId: { type: "string", minLength: 1, maxLength: 36 } } } },
  }, async (request, reply) => {
    const actor = exigirUsuarioAutenticado(request, reply);
    if (!actor) return;
    const key = await prisma.chaveApi.findUnique({ where: { id: request.params.keyId } });
    if (!key) return reply.code(404).send({ codigo: "CHAVE_NAO_ENCONTRADA", mensagem: "Chave não encontrada." });
    await prisma.$transaction(async (tx) => {
      await tx.chaveApi.update({ where: { id: key.id }, data: { revogadaEm: key.revogadaEm ?? new Date() } });
      await tx.journalTransacao.create({ data: {
        usuarioResponsavel: actor.id, operacao: "REVOGAR_CHAVE", entidade: `chaves_api/${key.id}`,
        dadosAntes: { revogadaEm: key.revogadaEm }, dadosDepois: { revogadaEm: key.revogadaEm ?? new Date() },
      } });
    });
    return reply.code(204).send();
  });
}
