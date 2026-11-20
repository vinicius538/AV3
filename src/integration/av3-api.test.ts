import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";

process.env.JWT_SECRET ??= `${randomUUID()}${randomUUID()}`;
process.env.API_KEY_PEPPER ??= `${randomUUID()}${randomUUID()}`;
process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/greencode_test";

const { criarApp } = await import("../../app");
const app = criarApp({ logger: false });
await app.ready();

test("OpenAPI documenta os endpoints públicos AV3 e autenticações distintas", async () => {
  const response = await app.inject({ method: "GET", url: "/docs/json" });
  assert.equal(response.statusCode, 200);
  const specification = response.json<{ paths: Record<string, unknown>; components: { securitySchemes: Record<string, unknown> } }>();
  assert.ok(specification.paths["/api/v1/public/traceability/{code}"]);
  assert.ok(specification.paths["/api/v1/public/analytics/reports"]);
  assert.ok(specification.paths["/api/v1/public/analytics/reports/{runId}"]);
  assert.ok(specification.components.securitySchemes.ApiKeyAuth);
  assert.ok(specification.components.securitySchemes.BearerAuth);
});

test("a API pública recusa requisição sem chave antes de consultar o banco", async () => {
  const response = await app.inject({ method: "GET", url: "/api/v1/public/traceability/nao-existe" });
  assert.equal(response.statusCode, 401);
  assert.equal(response.json<{ codigo: string }>().codigo, "API_KEY_INVALIDA");
});

test("a API pública não aceita chave malformada", async () => {
  const response = await app.inject({ method: "GET", url: "/api/v1/public/traceability/nao-existe", headers: { "x-api-key": "invalida" } });
  assert.equal(response.statusCode, 401);
});

after(async () => app.close());
