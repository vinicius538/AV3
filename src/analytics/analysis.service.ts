import { prisma } from "../lib/db";
import { calcularEficiencia, calcularRentabilidade, preverRul } from "./calculations";
import { mean, median } from "simple-statistics";
import type { Prisma } from "../generated/prisma/client";

export type TipoAnaliseApi = "EFICIENCIA_OPERACIONAL" | "RENTABILIDADE" | "RUL";
export type ParametrosAnalise = {
  organizacaoId?: string;
  inicio?: string;
  fim?: string;
  metrica?: string;
  limiar?: number;
  formato?: "json" | "csv";
};

function jsonSafe(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function executarAnalise(tipo: TipoAnaliseApi, parametros: ParametrosAnalise, usuarioId?: string, parceiroId?: string, tarefaId?: string) {
  const iniciadaEm = new Date();
  const inicio = parametros.inicio ? new Date(parametros.inicio) : undefined;
  const fim = parametros.fim ? new Date(parametros.fim) : new Date();
  let resultado: unknown;
  let previsoes: Array<{ equipamentoId: string; tipo: string; prediction: Extract<ReturnType<typeof preverRul>, { elegivel: true }> }> = [];

  if (tipo === "EFICIENCIA_OPERACIONAL") {
    const events = await prisma.eventoTriagem.findMany({
      where: {
        ...(fim ? { ocorridoEm: { lte: fim } } : {}),
        ...(parametros.organizacaoId ? { lote: { organizacaoId: parametros.organizacaoId } } : {}),
      },
      orderBy: { ocorridoEm: "asc" },
      select: { loteId: true, ocorridoEm: true, statusAnterior: true, statusNovo: true, operadorId: true },
    });
    resultado = {
      ...calcularEficiencia(events, inicio, fim),
      avisos: ["Lotes sem eventos de triagem registrados não entram na duração; a migração não inventa histórico legado."],
    };
  } else if (tipo === "RENTABILIDADE") {
    const equipments = await prisma.equipamento.findMany({
      where: parametros.organizacaoId ? { lote: { organizacaoId: parametros.organizacaoId } } : undefined,
      include: { materiaisRecuperados: true, custosRecuperacao: true },
      orderBy: { id: "asc" },
    });
    resultado = calcularRentabilidade(equipments.map((item) => ({
      id: item.id,
      tipo: item.tipo,
      marca: item.marca,
      modelo: item.modelo,
      estadoFisico: item.estadoFisico,
      precoMercado: Number(item.precoMercado),
      materiais: item.materiaisRecuperados.map((material) => ({
        material: material.material,
        quantidade: Number(material.quantidade),
        precoUnitario: Number(material.precoUnitario),
        moeda: material.moeda,
        fontePreco: material.fontePreco,
      })),
      custos: item.custosRecuperacao.map((cost) => ({ valor: Number(cost.valor), moeda: cost.moeda })),
    })));
  } else {
    if (parametros.limiar === undefined || !parametros.metrica) {
      throw new Error("RUL exige 'metrica' e 'limiar' para a série de saúde selecionada.");
    }
    const observations = await prisma.observacaoEquipamento.findMany({
      where: {
        metrica: parametros.metrica,
        ...(inicio || fim ? { ocorridoEm: { ...(inicio ? { gte: inicio } : {}), ...(fim ? { lte: fim } : {}) } } : {}),
        ...(parametros.organizacaoId ? { equipamento: { lote: { organizacaoId: parametros.organizacaoId } } } : {}),
      },
      orderBy: [{ equipamentoId: "asc" }, { ocorridoEm: "asc" }],
      select: {
        id: true, equipamentoId: true, ocorridoEm: true, valor: true, unidade: true,
        equipamento: { select: { tipo: true, marca: true, modelo: true } },
      },
    });
    const units = new Set(observations.map((row) => row.unidade));
    if (units.size > 1) throw new Error("A mesma métrica RUL foi registrada com unidades diferentes; normalize os dados antes da análise.");
    const failed = await prisma.falhaEquipamento.findMany({ where: { inservivel: true, ocorridoEm: { lte: fim } }, select: { equipamentoId: true } });
    const failedIds = new Set(failed.map((row) => row.equipamentoId));
    const grouped = new Map<string, typeof observations>();
    for (const row of observations) {
      const rows = grouped.get(row.equipamentoId) ?? [];
      rows.push(row);
      grouped.set(row.equipamentoId, rows);
    }
    const all = [...grouped.entries()].map(([equipamentoId, rows]) => {
      const equipamento = rows[0]!.equipamento;
      return failedIds.has(equipamentoId)
        ? { equipamentoId, ...equipamento, elegivel: false as const, motivo: "EQUIPAMENTO_JA_INSERVIVEL", quantidadeObservacoes: rows.length }
        : {
          equipamentoId,
          ...equipamento,
          ...preverRul(rows.map((row) => ({ id: row.id, occurredAt: row.ocorridoEm, value: Number(row.valor) })), parametros.limiar!),
        };
    });
    previsoes = all.flatMap((row) => row.elegivel ? [{ equipamentoId: row.equipamentoId, tipo: row.tipo, prediction: row }] : []);
    const previsoesPorTipo = new Map<string, number[]>();
    for (const row of previsoes) {
      const values = previsoesPorTipo.get(row.tipo) ?? [];
      values.push(row.prediction.valorEstimadoDias);
      previsoesPorTipo.set(row.tipo, values);
    }
    resultado = {
      metrica: parametros.metrica,
      unidade: [...units][0] ?? null,
      limiar: parametros.limiar,
      quantidadeElegivel: previsoes.length,
      quantidadeInelegivel: all.length - previsoes.length,
      inelegiveis: all.filter((row) => !row.elegivel).map(({ equipamentoId, tipo, marca, modelo, motivo, quantidadeObservacoes }) => ({ equipamentoId, tipo, marca, modelo, motivo, quantidadeObservacoes })),
      previsoes: previsoes.map(({ equipamentoId, tipo, prediction }) => ({ equipamentoId, tipo, ...prediction })),
      porTipoEquipamento: [...previsoesPorTipo.entries()].map(([tipo, values]) => ({ tipo, quantidade: values.length, mediaDias: mean(values), medianaDias: median(values) })),
    };
  }

  const execucao = await prisma.$transaction(async (tx) => {
    const created = await tx.execucaoAnalitica.create({
      data: {
        tipo,
        parametros: jsonSafe(parametros),
        resultado: jsonSafe(resultado),
        iniciadaEm,
        concluidaEm: new Date(),
        janelaInicio: inicio,
        janelaFim: fim,
        usuarioId,
        parceiroId,
        organizacaoId: parametros.organizacaoId,
      },
    });
    if (previsoes.length) {
      await tx.previsaoRul.createMany({
        data: previsoes.map(({ equipamentoId, prediction }) => ({
          equipamentoId,
          execucaoId: created.id,
          metodo: prediction.metodo,
          valorEstimadoDias: prediction.valorEstimadoDias,
          dataAlvo: prediction.dataAlvo,
          corteDados: prediction.corteDados,
          instantaneo: jsonSafe(prediction.instantaneo),
        })),
      });
    }
    if (tarefaId) await tx.tarefaAssincrona.update({ where: { id: tarefaId }, data: { execucaoId: created.id } });
    return created;
  });
  return { execucaoId: execucao.id, tipo, resultado };
}

export async function consultarExecucoes(parceiroId?: string, organizacaoIds?: string[]) {
  return prisma.execucaoAnalitica.findMany({
    where: {
      ...(parceiroId ? { parceiroId } : {}),
      ...(organizacaoIds ? { organizacaoId: { in: organizacaoIds } } : {}),
    },
    orderBy: { concluidaEm: "desc" },
    take: 100,
    select: {
      id: true, tipo: true, parametros: true, resultado: true, iniciadaEm: true, concluidaEm: true, organizacaoId: true, versaoMetodo: true,
      previsoes: { select: { equipamentoId: true, metodo: true, valorEstimadoDias: true, dataAlvo: true, corteDados: true, falhaRealEm: true, erroDias: true } },
    },
  });
}
