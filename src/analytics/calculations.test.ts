import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularEficiencia, calcularRentabilidade, preverRul } from "./calculations";

test("eficiência mede a partir da transição para triagem e exclui lotes não concluídos", () => {
  const events = [
    { loteId: "a", ocorridoEm: new Date("2026-01-01T00:00:00Z"), statusAnterior: "RECEBIDO", statusNovo: "EM_TRIAGEM", operadorId: "op-1" },
    { loteId: "a", ocorridoEm: new Date("2026-01-03T00:00:00Z"), statusAnterior: "EM_TRIAGEM", statusNovo: "TRIAGEM_CONCLUIDA", operadorId: "op-2" },
    { loteId: "b", ocorridoEm: new Date("2026-01-01T00:00:00Z"), statusAnterior: null, statusNovo: "RECEBIDO", operadorId: "op-1" },
    { loteId: "c", ocorridoEm: new Date("2026-01-02T00:00:00Z"), statusAnterior: "RECEBIDO", statusNovo: "EM_TRIAGEM", operadorId: null },
  ];
  const result = calcularEficiencia(events);
  assert.equal(result.quantidadeConcluida, 1);
  assert.equal(result.quantidadeNaoIniciada, 1);
  assert.equal(result.quantidadeIncompletaOuInvalida, 1);
  assert.equal(result.media, 2);
  assert.equal(result.mediana, 2);
  assert.equal(result.duracoes[0]?.operadorId, "op-1");
});

test("rentabilidade não confunde preço de mercado com recuperação e não presume custo zero", () => {
  const [result] = calcularRentabilidade([{
    id: "equipment-1", tipo: "NOTEBOOK", marca: "Marca", modelo: "Modelo", estadoFisico: "RUIM", precoMercado: 1200,
    materiais: [{ material: "cobre", quantidade: 2, precoUnitario: 10, moeda: "BRL", fontePreco: "cotação registrada" }],
    custos: [],
  }]);
  assert.equal(result?.precoMercadoMedio, 1200);
  assert.equal(result?.valorBrutoRecuperacaoMedio, 20);
  assert.equal(result?.custoRecuperacaoMedio, null);
  assert.equal(result?.lucroEstimadoMedio, null);
  assert.equal(result?.margemSobreValorBrutoPercentual, null);
});

test("MQO projeta RUL e marca séries insuficientes ou não degradantes", () => {
  const observations = [
    { id: "1", occurredAt: new Date("2026-01-01T00:00:00Z"), value: 100 },
    { id: "2", occurredAt: new Date("2026-01-11T00:00:00Z"), value: 80 },
    { id: "3", occurredAt: new Date("2026-01-21T00:00:00Z"), value: 60 },
  ];
  const prediction = preverRul(observations, 0);
  assert.equal(prediction.elegivel, true);
  if (prediction.elegivel) {
    assert.equal(Math.round(prediction.valorEstimadoDias), 30);
    assert.equal(prediction.metodo, "REGRESSAO_LINEAR_MQO");
  }
  assert.equal(preverRul(observations.slice(0, 2), 0).motivo, "DADOS_INSUFICIENTES");
  assert.equal(preverRul(observations.map((row) => ({ ...row, value: 50 })), 0).motivo, "TENDENCIA_NAO_DEGRADANTE");
});
