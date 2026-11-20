-- CreateEnum
CREATE TYPE "TipoAnalise" AS ENUM ('EFICIENCIA_OPERACIONAL', 'RENTABILIDADE', 'RUL');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('PENDENTE', 'EM_EXECUCAO', 'CONCLUIDA', 'FALHA_FINAL');

-- CreateTable
CREATE TABLE "parceiros_api" (
    "id" VARCHAR(36) NOT NULL,
    "nome" VARCHAR(150) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parceiros_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acessos_parceiro_organizacao" (
    "parceiro_id" VARCHAR(36) NOT NULL,
    "organizacao_id" VARCHAR(36) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acessos_parceiro_organizacao_pkey" PRIMARY KEY ("parceiro_id","organizacao_id")
);

-- CreateTable
CREATE TABLE "chaves_api" (
    "id" VARCHAR(36) NOT NULL,
    "prefixo" VARCHAR(24) NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "escopos" JSONB NOT NULL,
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMP(3),
    "revogada_em" TIMESTAMP(3),
    "ultimo_uso_em" TIMESTAMP(3),
    "parceiro_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "chaves_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditorias_api" (
    "id" VARCHAR(36) NOT NULL,
    "ocorrido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operacao" VARCHAR(60) NOT NULL,
    "entidade" VARCHAR(100) NOT NULL,
    "detalhes" JSONB,
    "chave_api_id" VARCHAR(36) NOT NULL,
    "idempotencia" VARCHAR(150),

    CONSTRAINT "auditorias_api_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_triagem" (
    "id" VARCHAR(36) NOT NULL,
    "ocorrido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status_anterior" "StatusLote",
    "status_novo" "StatusLote" NOT NULL,
    "lote_id" VARCHAR(36) NOT NULL,
    "operador_id" VARCHAR(36),

    CONSTRAINT "eventos_triagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observacoes_equipamento" (
    "id" VARCHAR(36) NOT NULL,
    "ocorrido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrica" VARCHAR(80) NOT NULL,
    "valor" DECIMAL(12,4) NOT NULL,
    "unidade" VARCHAR(30) NOT NULL,
    "estado_fisico" "EstadoFisico",
    "observacao" TEXT,
    "equipamento_id" VARCHAR(36) NOT NULL,
    "operador_id" VARCHAR(36),

    CONSTRAINT "observacoes_equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "falhas_equipamento" (
    "id" VARCHAR(36) NOT NULL,
    "ocorrido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "descricao" TEXT NOT NULL,
    "inservivel" BOOLEAN NOT NULL DEFAULT false,
    "reparado_em" TIMESTAMP(3),
    "equipamento_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "falhas_equipamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materiais_recuperados" (
    "id" VARCHAR(36) NOT NULL,
    "material" VARCHAR(100) NOT NULL,
    "quantidade" DECIMAL(12,4) NOT NULL,
    "unidade" VARCHAR(30) NOT NULL,
    "preco_unitario" DECIMAL(12,4) NOT NULL,
    "moeda" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "fonte_preco" VARCHAR(200) NOT NULL,
    "avaliado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipamento_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "materiais_recuperados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custos_recuperacao" (
    "id" VARCHAR(36) NOT NULL,
    "categoria" VARCHAR(80) NOT NULL,
    "descricao" TEXT,
    "valor" DECIMAL(12,2) NOT NULL,
    "moeda" VARCHAR(3) NOT NULL DEFAULT 'BRL',
    "ocorrido_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipamento_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "custos_recuperacao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execucoes_analiticas" (
    "id" VARCHAR(36) NOT NULL,
    "tipo" "TipoAnalise" NOT NULL,
    "parametros" JSONB NOT NULL,
    "resultado" JSONB NOT NULL,
    "iniciada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "concluida_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "janela_inicio" TIMESTAMP(3),
    "janela_fim" TIMESTAMP(3),
    "versao_metodo" VARCHAR(30) NOT NULL DEFAULT '1',
    "usuario_id" VARCHAR(36),
    "parceiro_id" VARCHAR(36),
    "organizacao_id" VARCHAR(36),

    CONSTRAINT "execucoes_analiticas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "previsoes_rul" (
    "id" VARCHAR(36) NOT NULL,
    "metodo" VARCHAR(50) NOT NULL,
    "valor_estimado_dias" DECIMAL(12,2) NOT NULL,
    "data_alvo" TIMESTAMP(3),
    "corte_dados" TIMESTAMP(3) NOT NULL,
    "instantaneo" JSONB NOT NULL,
    "falha_real_em" TIMESTAMP(3),
    "erro_dias" DECIMAL(12,2),
    "equipamento_id" VARCHAR(36) NOT NULL,
    "execucao_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "previsoes_rul_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas_assincronas" (
    "id" VARCHAR(36) NOT NULL,
    "tipo" VARCHAR(60) NOT NULL,
    "status" "StatusTarefa" NOT NULL DEFAULT 'PENDENTE',
    "progresso" INTEGER NOT NULL DEFAULT 0,
    "parametros" JSONB NOT NULL,
    "erro" TEXT,
    "idempotencia" VARCHAR(150),
    "criada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "iniciada_em" TIMESTAMP(3),
    "concluida_em" TIMESTAMP(3),
    "usuario_id" VARCHAR(36),
    "parceiro_id" VARCHAR(36),
    "chave_api_id" VARCHAR(36),
    "execucao_id" VARCHAR(36),

    CONSTRAINT "tarefas_assincronas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relatorios_gerados" (
    "id" VARCHAR(36) NOT NULL,
    "formato" VARCHAR(10) NOT NULL,
    "caminho" VARCHAR(500) NOT NULL,
    "checksum" VARCHAR(64) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_em" TIMESTAMP(3) NOT NULL,
    "tarefa_id" VARCHAR(36) NOT NULL,

    CONSTRAINT "relatorios_gerados_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "acessos_parceiro_organizacao_organizacao_id_idx" ON "acessos_parceiro_organizacao"("organizacao_id");

-- CreateIndex
CREATE UNIQUE INDEX "chaves_api_prefixo_key" ON "chaves_api"("prefixo");

-- CreateIndex
CREATE UNIQUE INDEX "chaves_api_hash_key" ON "chaves_api"("hash");

-- CreateIndex
CREATE INDEX "chaves_api_parceiro_id_revogada_em_idx" ON "chaves_api"("parceiro_id", "revogada_em");

-- CreateIndex
CREATE INDEX "auditorias_api_chave_api_id_ocorrido_em_idx" ON "auditorias_api"("chave_api_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "auditorias_api_entidade_ocorrido_em_idx" ON "auditorias_api"("entidade", "ocorrido_em");

-- CreateIndex
CREATE UNIQUE INDEX "auditorias_api_chave_api_id_idempotencia_key" ON "auditorias_api"("chave_api_id", "idempotencia");

-- CreateIndex
CREATE INDEX "eventos_triagem_lote_id_ocorrido_em_idx" ON "eventos_triagem"("lote_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "eventos_triagem_operador_id_ocorrido_em_idx" ON "eventos_triagem"("operador_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "observacoes_equipamento_equipamento_id_ocorrido_em_idx" ON "observacoes_equipamento"("equipamento_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "falhas_equipamento_equipamento_id_ocorrido_em_idx" ON "falhas_equipamento"("equipamento_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "falhas_equipamento_inservivel_ocorrido_em_idx" ON "falhas_equipamento"("inservivel", "ocorrido_em");

-- CreateIndex
CREATE INDEX "materiais_recuperados_equipamento_id_avaliado_em_idx" ON "materiais_recuperados"("equipamento_id", "avaliado_em");

-- CreateIndex
CREATE INDEX "custos_recuperacao_equipamento_id_ocorrido_em_idx" ON "custos_recuperacao"("equipamento_id", "ocorrido_em");

-- CreateIndex
CREATE INDEX "execucoes_analiticas_tipo_concluida_em_idx" ON "execucoes_analiticas"("tipo", "concluida_em");

-- CreateIndex
CREATE INDEX "execucoes_analiticas_organizacao_id_concluida_em_idx" ON "execucoes_analiticas"("organizacao_id", "concluida_em");

-- CreateIndex
CREATE INDEX "execucoes_analiticas_parceiro_id_concluida_em_idx" ON "execucoes_analiticas"("parceiro_id", "concluida_em");

-- CreateIndex
CREATE INDEX "previsoes_rul_equipamento_id_corte_dados_idx" ON "previsoes_rul"("equipamento_id", "corte_dados");

-- CreateIndex
CREATE INDEX "previsoes_rul_execucao_id_idx" ON "previsoes_rul"("execucao_id");

-- CreateIndex
CREATE UNIQUE INDEX "tarefas_assincronas_idempotencia_key" ON "tarefas_assincronas"("idempotencia");

-- CreateIndex
CREATE UNIQUE INDEX "tarefas_assincronas_execucao_id_key" ON "tarefas_assincronas"("execucao_id");

-- CreateIndex
CREATE INDEX "tarefas_assincronas_status_criada_em_idx" ON "tarefas_assincronas"("status", "criada_em");

-- CreateIndex
CREATE INDEX "tarefas_assincronas_parceiro_id_criada_em_idx" ON "tarefas_assincronas"("parceiro_id", "criada_em");

-- CreateIndex
CREATE UNIQUE INDEX "relatorios_gerados_tarefa_id_key" ON "relatorios_gerados"("tarefa_id");

-- CreateIndex
CREATE INDEX "relatorios_gerados_expira_em_idx" ON "relatorios_gerados"("expira_em");

-- AddForeignKey
ALTER TABLE "acessos_parceiro_organizacao" ADD CONSTRAINT "acessos_parceiro_organizacao_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acessos_parceiro_organizacao" ADD CONSTRAINT "acessos_parceiro_organizacao_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chaves_api" ADD CONSTRAINT "chaves_api_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditorias_api" ADD CONSTRAINT "auditorias_api_chave_api_id_fkey" FOREIGN KEY ("chave_api_id") REFERENCES "chaves_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_triagem" ADD CONSTRAINT "eventos_triagem_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_triagem" ADD CONSTRAINT "eventos_triagem_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacoes_equipamento" ADD CONSTRAINT "observacoes_equipamento_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observacoes_equipamento" ADD CONSTRAINT "observacoes_equipamento_operador_id_fkey" FOREIGN KEY ("operador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "falhas_equipamento" ADD CONSTRAINT "falhas_equipamento_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiais_recuperados" ADD CONSTRAINT "materiais_recuperados_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custos_recuperacao" ADD CONSTRAINT "custos_recuperacao_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucoes_analiticas" ADD CONSTRAINT "execucoes_analiticas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucoes_analiticas" ADD CONSTRAINT "execucoes_analiticas_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execucoes_analiticas" ADD CONSTRAINT "execucoes_analiticas_organizacao_id_fkey" FOREIGN KEY ("organizacao_id") REFERENCES "organizacoes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previsoes_rul" ADD CONSTRAINT "previsoes_rul_equipamento_id_fkey" FOREIGN KEY ("equipamento_id") REFERENCES "equipamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previsoes_rul" ADD CONSTRAINT "previsoes_rul_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "execucoes_analiticas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas_assincronas" ADD CONSTRAINT "tarefas_assincronas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas_assincronas" ADD CONSTRAINT "tarefas_assincronas_parceiro_id_fkey" FOREIGN KEY ("parceiro_id") REFERENCES "parceiros_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas_assincronas" ADD CONSTRAINT "tarefas_assincronas_chave_api_id_fkey" FOREIGN KEY ("chave_api_id") REFERENCES "chaves_api"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas_assincronas" ADD CONSTRAINT "tarefas_assincronas_execucao_id_fkey" FOREIGN KEY ("execucao_id") REFERENCES "execucoes_analiticas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relatorios_gerados" ADD CONSTRAINT "relatorios_gerados_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas_assincronas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
