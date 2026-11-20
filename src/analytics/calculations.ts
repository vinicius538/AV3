import { linearRegression, mean, median, quantileSorted, standardDeviation } from "simple-statistics";

export type TriagemEvent = {
  loteId: string;
  ocorridoEm: Date;
  statusAnterior: string | null;
  statusNovo: string;
  operadorId: string | null;
};

export function calcularEficiencia(events: TriagemEvent[], periodStart?: Date, periodEnd?: Date) {
  const porLote = new Map<string, TriagemEvent[]>();
  for (const event of events) {
    const current = porLote.get(event.loteId) ?? [];
    current.push(event);
    porLote.set(event.loteId, current);
  }

  const durations: Array<{ loteId: string; operadorId: string | null; inicio: Date; conclusao: Date; dias: number }> = [];
  let incompletos = 0;
  let naoIniciados = 0;
  for (const [loteId, loteEvents] of porLote) {
    loteEvents.sort((a, b) => a.ocorridoEm.getTime() - b.ocorridoEm.getTime());
    const inicio = loteEvents.find((event) => event.statusAnterior === "RECEBIDO" && event.statusNovo === "EM_TRIAGEM");
    if (!inicio) { naoIniciados += 1; continue; }
    const conclusao = inicio && loteEvents.find((event) =>
      event.ocorridoEm > inicio.ocorridoEm && event.statusNovo === "TRIAGEM_CONCLUIDA",
    );
    if (!conclusao || conclusao.ocorridoEm <= inicio.ocorridoEm) {
      incompletos += 1;
      continue;
    }
    if ((periodStart && conclusao.ocorridoEm < periodStart) || (periodEnd && conclusao.ocorridoEm > periodEnd)) continue;
    durations.push({
      loteId,
      operadorId: inicio.operadorId,
      inicio: inicio.ocorridoEm,
      conclusao: conclusao.ocorridoEm,
      dias: (conclusao.ocorridoEm.getTime() - inicio.ocorridoEm.getTime()) / 86_400_000,
    });
  }

  const values = durations.map(({ dias }) => dias);
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted.length ? quantileSorted(sorted, 0.25) : null;
  const q3 = sorted.length ? quantileSorted(sorted, 0.75) : null;
  const iqr = q1 === null || q3 === null ? null : q3 - q1;
  const lower = q1 === null || iqr === null ? null : q1 - 1.5 * iqr;
  const upper = q3 === null || iqr === null ? null : q3 + 1.5 * iqr;
  const outliers = lower === null || upper === null
    ? []
    : durations.filter((item) => item.dias < lower || item.dias > upper).map(({ loteId, dias }) => ({ loteId, dias }));

  const groups = new Map<string, number[]>();
  for (const row of durations) {
    const month = `${row.conclusao.getUTCFullYear()}-${String(row.conclusao.getUTCMonth() + 1).padStart(2, "0")}`;
    for (const [dimension, key] of [["operador", row.operadorId ?? "NAO_ATRIBUIDO"], ["mes", month]]) {
      const groupKey = `${dimension}:${key}`;
      const list = groups.get(groupKey) ?? [];
      list.push(row.dias);
      groups.set(groupKey, list);
    }
  }

  return {
    unidade: "dias",
    quantidadeConcluida: values.length,
    quantidadeNaoIniciada: naoIniciados,
    quantidadeIncompletaOuInvalida: incompletos,
    media: values.length ? mean(values) : null,
    mediana: values.length ? median(values) : null,
    desvioPadraoPopulacional: values.length > 1 ? standardDeviation(values) : null,
    q1,
    q3,
    intervaloInterquartil: iqr,
    valoresExtremosIqr: outliers,
    porGrupo: [...groups.entries()].map(([key, durationsInGroup]) => ({
      dimensao: key.split(":", 1)[0],
      grupo: key.slice(key.indexOf(":") + 1),
      quantidade: durationsInGroup.length,
      mediaDias: mean(durationsInGroup),
      medianaDias: median(durationsInGroup),
    })),
    duracoes: durations,
  };
}

export type ProfitabilityEquipment = {
  id: string;
  tipo: string;
  marca: string;
  modelo: string;
  estadoFisico: string;
  precoMercado: number;
  materiais: Array<{ material: string; quantidade: number; precoUnitario: number; moeda: string; fontePreco: string }>;
  custos: Array<{ valor: number; moeda: string }>;
};

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calcularRentabilidade(equipamentos: ProfitabilityEquipment[]) {
  const grouped = new Map<string, ProfitabilityEquipment[]>();
  for (const equipamento of equipamentos) {
    const key = [equipamento.tipo, equipamento.estadoFisico, equipamento.marca, equipamento.modelo].join("|");
    const current = grouped.get(key) ?? [];
    current.push(equipamento);
    grouped.set(key, current);
  }
  return [...grouped.entries()].flatMap(([key, rows]) => {
    const currencies = new Set(rows.flatMap((row) => [...row.materiais.map((item) => item.moeda), ...row.custos.map((item) => item.moeda)]));
    const currencyList = currencies.size ? [...currencies] : ["BRL"];
    return currencyList.map((currency) => {
      const withRecovery = rows.filter((row) => row.materiais.some((item) => item.moeda === currency));
      const withCost = rows.filter((row) => row.custos.some((item) => item.moeda === currency));
      const recoveryByEquipment = new Map(withRecovery.map((row) => [row.id, row.materiais.filter((item) => item.moeda === currency).reduce((sum, item) => sum + item.quantidade * item.precoUnitario, 0)]));
      const costsByEquipment = new Map(withCost.map((row) => [row.id, row.custos.filter((item) => item.moeda === currency).reduce((sum, item) => sum + item.valor, 0)]));
      const comparableIds = [...recoveryByEquipment.keys()].filter((id) => costsByEquipment.has(id));
      const profits = comparableIds.map((id) => recoveryByEquipment.get(id)! - costsByEquipment.get(id)!);
      const comparableGross = comparableIds.reduce((sum, id) => sum + recoveryByEquipment.get(id)!, 0);
      const comparableCost = comparableIds.reduce((sum, id) => sum + costsByEquipment.get(id)!, 0);
      const profitTotal = profits.reduce((sum, value) => sum + value, 0);
      return {
        tipo: rows[0]!.tipo,
        estadoFisico: rows[0]!.estadoFisico,
        marca: rows[0]!.marca,
        modelo: rows[0]!.modelo,
        quantidadeEquipamentos: rows.length,
        quantidadeComDadosRecuperacao: withRecovery.length,
        quantidadeComDadosCusto: withCost.length,
        quantidadeComDadosComparaveis: comparableIds.length,
        precoMercadoMedio: roundMoney(mean(rows.map((row) => row.precoMercado))),
        moedaPrecoMercado: "NAO_INFORMADA_NO_CADASTRO",
        valorBrutoRecuperacaoMedio: withRecovery.length ? roundMoney(mean([...recoveryByEquipment.values()])) : null,
        custoRecuperacaoMedio: withCost.length ? roundMoney(mean([...costsByEquipment.values()])) : null,
        lucroEstimadoMedio: profits.length ? roundMoney(mean(profits)) : null,
        margemSobreValorBrutoPercentual: profits.length && comparableGross > 0 ? roundMoney((profitTotal / comparableGross) * 100) : null,
        retornoSobreCustoPercentual: profits.length && comparableCost > 0 ? roundMoney((profitTotal / comparableCost) * 100) : null,
        moeda: currency,
        fontesPreco: [...new Set(rows.flatMap((row) => row.materiais.filter((item) => item.moeda === currency).map((item) => item.fontePreco)))],
        grupo: key,
      };
    });
  });
}

export type HealthObservation = { id: string; occurredAt: Date; value: number };

export function preverRul(observations: HealthObservation[], threshold: number, minimumObservations = 3) {
  const ordered = [...observations].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  if (ordered.length < minimumObservations) return { elegivel: false as const, motivo: "DADOS_INSUFICIENTES", quantidadeObservacoes: ordered.length };
  if (ordered.some((row) => !Number.isFinite(row.value)) || !Number.isFinite(threshold)) {
    return { elegivel: false as const, motivo: "DADOS_INVALIDOS", quantidadeObservacoes: ordered.length };
  }
  const origin = ordered[0]!.occurredAt.getTime();
  const points: [number, number][] = ordered.map((row) => [(row.occurredAt.getTime() - origin) / 86_400_000, row.value]);
  const { m: slope, b: intercept } = linearRegression(points);
  if (!(slope < 0)) return { elegivel: false as const, motivo: "TENDENCIA_NAO_DEGRADANTE", quantidadeObservacoes: ordered.length, slope };
  const last = ordered[ordered.length - 1]!;
  const lastX = points[points.length - 1]![0];
  const remainingDays = Math.max(0, (threshold - intercept) / slope - lastX);
  return {
    elegivel: true as const,
    metodo: "REGRESSAO_LINEAR_MQO",
    quantidadeObservacoes: ordered.length,
    slope,
    intercept,
    valorAtualEstimado: intercept + slope * lastX,
    limiar: threshold,
    valorEstimadoDias: remainingDays,
    dataAlvo: new Date(last.occurredAt.getTime() + remainingDays * 86_400_000),
    corteDados: last.occurredAt,
    instantaneo: ordered.map((row) => ({ id: row.id, ocorridoEm: row.occurredAt.toISOString(), valor: row.value })),
  };
}
