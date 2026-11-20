import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { prisma } from "../lib/db";
import type { Prisma } from "../generated/prisma/client";

function digest(value: string) {
  const pepper = process.env.API_KEY_PEPPER;
  if (!pepper || Buffer.byteLength(pepper) < 32) throw new Error("API_KEY_PEPPER precisa ter pelo menos 32 bytes.");
  return createHmac("sha256", pepper).update(value).digest("hex");
}

export async function criarChaveApi(parceiroId: string, scopes: string[], expiraEm?: Date, tx?: Prisma.TransactionClient) {
  const prefix = `gc_${randomBytes(10).toString("hex")}`;
  const raw = `${prefix}.${randomBytes(32).toString("base64url")}`;
  const key = await (tx ?? prisma).chaveApi.create({
    data: { parceiroId, prefixo: prefix, hash: digest(raw), escopos: scopes, expiraEm },
    select: { id: true, prefixo: true, escopos: true, criadaEm: true, expiraEm: true },
  });
  return { ...key, chave: raw };
}

export const autenticarApiKey: preHandlerHookHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!process.env.API_KEY_PEPPER || Buffer.byteLength(process.env.API_KEY_PEPPER) < 32) {
    return reply.code(503).send({ codigo: "INTEGRACAO_INDISPONIVEL", mensagem: "A autenticação de integrações não está configurada." });
  }
  const raw = request.headers["x-api-key"];
  if (typeof raw !== "string" || !raw.includes(".")) return reply.code(401).send({ codigo: "API_KEY_INVALIDA", mensagem: "API Key ausente ou inválida." });
  const prefix = raw.slice(0, raw.indexOf("."));
  const record = await prisma.chaveApi.findUnique({
    where: { prefixo: prefix },
    include: { parceiro: { include: { organizacoes: { where: { organizacao: { ativo: true } }, select: { organizacaoId: true } } } } },
  });
  if (!record || !record.parceiro.ativo || record.revogadaEm || (record.expiraEm && record.expiraEm <= new Date())) {
    return reply.code(401).send({ codigo: "API_KEY_INVALIDA", mensagem: "API Key ausente ou inválida." });
  }
  const candidate = Buffer.from(digest(raw));
  const stored = Buffer.from(record.hash);
  if (candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) {
    return reply.code(401).send({ codigo: "API_KEY_INVALIDA", mensagem: "API Key ausente ou inválida." });
  }
  const scopes = Array.isArray(record.escopos) ? record.escopos.filter((scope): scope is string => typeof scope === "string") : [];
  request.apiPrincipal = {
    keyId: record.id,
    partnerId: record.parceiroId,
    scopes,
    organizationIds: record.parceiro.organizacoes.map((entry) => entry.organizacaoId),
  };
  if (!record.ultimoUsoEm || Date.now() - record.ultimoUsoEm.getTime() > 300_000) {
    void prisma.chaveApi.updateMany({ where: { id: record.id }, data: { ultimoUsoEm: new Date() } }).catch(() => undefined);
  }
};

export function exigirEscopo(scope: string): preHandlerHookHandler {
  return async (request, reply) => {
    if (!request.apiPrincipal) return reply.code(401).send({ codigo: "API_KEY_INVALIDA", mensagem: "Autenticação por API Key necessária." });
    if (!request.apiPrincipal.scopes.includes(scope)) return reply.code(403).send({ codigo: "ESCOPO_INSUFICIENTE", mensagem: "A chave não possui o escopo necessário." });
  };
}

export function exigirOrganizacaoPermitida(request: FastifyRequest, reply: FastifyReply, organizacaoId: string) {
  if (!request.apiPrincipal?.organizationIds.includes(organizacaoId)) {
    reply.code(404).send({ codigo: "RECURSO_NAO_ENCONTRADO", mensagem: "Recurso não encontrado." });
    return false;
  }
  return true;
}
