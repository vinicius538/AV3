# GreenCode API

API REST para gestão de logística reversa de equipamentos eletrônicos. O projeto usa Node.js, TypeScript, Fastify, Prisma ORM e PostgreSQL.

## Requisitos

- Node.js 20 ou superior e npm
- PostgreSQL acessível pela máquina onde a API será executada

## Instalação e configuração

1. Instale as dependências:

   ```powershell
   npm install
   ```

2. Copie `.env.example` para `.env` e ajuste a conexão do banco:

   ```env
   DATABASE_URL="postgresql://usuario:senha@localhost:5432/av2green_code?schema=public"
   JWT_SECRET="uma-chave-aleatoria-com-pelo-menos-32-bytes"
   SEED_ADMIN_USER="admin"
   SEED_ADMIN_PASSWORD="defina-uma-senha-forte"
   ```

   `JWT_SECRET` deve ter ao menos 32 bytes. Gere uma chave aleatória, por exemplo:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
   ```

   Não compartilhe nem versione o arquivo `.env`.

3. Confirme que o PostgreSQL está ligado e que o banco indicado em `DATABASE_URL` existe. A porta padrão usada neste exemplo é `5432`.

4. Gere o Prisma Client e aplique as migrations:

   ```powershell
   npm run db:generate
   npm run db:migrate
   ```

5. Crie o primeiro administrador:

   ```powershell
   npm run db:seed
   ```

   A seed usa `SEED_ADMIN_USER` e `SEED_ADMIN_PASSWORD`. Ela cria a conta somente quando não há usuários ativos; se já houver contas, não cria outra administradora.

## Executar

Modo de desenvolvimento, com reinicialização ao detectar alterações:

```powershell
npm run dev
```

Executar sem modo watch:

```powershell
npm start
```

A API escuta na porta `3000`: `http://localhost:3000`. Mantenha o terminal aberto enquanto usar a API. `Ctrl+C` inicia o encerramento graceful do servidor e desconecta o banco.

## Autenticação

Faça login com `POST /auth/login`:

```json
{
  "usuario": "admin",
  "senha": "a-senha-definida-no-env"
}
```

A resposta inclui `accessToken`. Envie-o nas rotas protegidas usando:

```http
Authorization: Bearer <accessToken>
```

O token expira em 30 minutos. A sessão também expira após 30 minutos sem atividade. Cada resposta autenticada pode trazer um token renovado no header `x-renewed-token`; use esse token nas próximas chamadas.

### Papéis de usuário

| Papel | Acesso principal |
| --- | --- |
| `ADMINISTRADOR` | Gerencia usuários e configurações, consulta journal e pode operar todos os cadastros. |
| `OPERADOR_CADASTRO` | Consulta e cadastra organizações e contratos. |
| `GESTOR_ALMOXARIFADO` | Consulta e gerencia lotes, equipamentos e movimentações. |
| `AUDITOR` | Consulta dados e histórico de movimentações e journal, sem permissão para alterar registros. |

Usuários são gerenciados em `/usuarios`; somente administradores podem consultar e alterar contas. A exclusão de usuário é uma inativação lógica.

## Rotas da API

Todas as rotas abaixo, exceto `POST /auth/login` e o primeiro cadastro de administrador em `POST /usuarios`, exigem autenticação. As permissões variam por papel.

### Organizações

| Método | Rota | Permissão |
| --- | --- | --- |
| `POST` | `/organizacoes` | Administrador, operador de cadastro |
| `GET` | `/organizacoes` | Administrador, operador de cadastro, auditor |
| `GET` | `/organizacoes/:id` | Administrador, operador de cadastro, auditor |
| `PUT` | `/organizacoes/:id` | Administrador |
| `PATCH` | `/organizacoes/:id` | Administrador |
| `DELETE` | `/organizacoes/:id?versao=N` | Administrador |

Exemplo de criação:

```json
{
  "razaoSocial": "Organização Exemplo Ltda.",
  "cnpj": "04.252.011/0001-10",
  "enderecoCompleto": "Rua Exemplo, 100 - São Paulo/SP",
  "telefone": "1133334444",
   "email": "contato@exemplo.com"
}
```

### Contratos

| Método | Rota | Permissão |
| --- | --- | --- |
| `POST` | `/organizacoes/:organizacaoId/contratos` | Administrador, operador de cadastro |
| `GET` | `/contratos` | Administrador, operador de cadastro, auditor |
| `GET` | `/contratos/:id` | Administrador, operador de cadastro, auditor |
| `PUT` | `/contratos/:id` | Administrador |
| `PATCH` | `/contratos/:id` | Administrador |
| `DELETE` | `/contratos/:id?versao=N` | Administrador |

O corpo de criação aceita `dataAssinatura` e `dataVencimento` em ISO 8601, `clausulas` como objeto JSON, `valorMensal` não negativo e `renovacaoAutomatica` opcional.

### Lotes

| Método | Rota | Permissão |
| --- | --- | --- |
| `POST` | `/organizacoes/:organizacaoId/lotes` | Administrador, gestor de almoxarifado |
| `GET` | `/lotes` | Administrador, gestor de almoxarifado, auditor |
| `GET` | `/lotes/:id` | Administrador, gestor de almoxarifado, auditor |
| `PUT` | `/lotes/:id` | Administrador, gestor de almoxarifado |
| `PATCH` | `/lotes/:id` | Administrador, gestor de almoxarifado |
| `DELETE` | `/lotes/:id?versao=N` | Administrador, gestor de almoxarifado |

O corpo inclui `dataEntrada`, `notaFiscal`, `transportadora`, `statusProcessamento` e `observacoes`. A data deve estar dentro dos últimos 90 dias e não pode ser futura.

### Equipamentos

| Método | Rota | Permissão |
| --- | --- | --- |
| `POST` | `/lotes/:loteId/equipamentos` | Administrador, gestor de almoxarifado |
| `GET` | `/equipamentos` | Administrador, gestor de almoxarifado, auditor |
| `GET` | `/equipamentos/:id` | Administrador, gestor de almoxarifado, auditor |
| `PUT` | `/equipamentos/:id` | Administrador, gestor de almoxarifado |
| `PATCH` | `/equipamentos/:id` | Administrador, gestor de almoxarifado |
| `DELETE` | `/equipamentos/:id?versao=N` | Administrador, gestor de almoxarifado |

O cadastro exige código interno, tipo, marca, modelo, ano, estado físico, peso, preço e status de rastreamento. `triagemCompleta` e `etiqueta` são opcionais na criação.

### Movimentações

| Método | Rota | Permissão |
| --- | --- | --- |
| `POST` | `/equipamentos/:equipamentoId/movimentacoes` | Administrador, gestor de almoxarifado |
| `GET` | `/equipamentos/:equipamentoId/movimentacoes` | Administrador, gestor de almoxarifado, auditor |

O corpo do `POST` recebe `origem`, `destino` e `observacao` opcional. O responsável é preenchido com o usuário autenticado.

### Usuários, journal e configurações

| Método | Rota | Permissão |
| --- | --- | --- |
| `POST` | `/usuarios` | Primeiro administrador sem token; depois, administrador |
| `GET` | `/usuarios`, `/usuarios/:id` | Administrador |
| `PUT`, `PATCH` | `/usuarios/:id` | Administrador |
| `DELETE` | `/usuarios/:id?versao=N` | Administrador; inativa a conta |
| `GET` | `/journal` | Administrador, auditor |
| `GET`, `PATCH` | `/configuracoes` | Administrador |

`GET /journal` aceita filtros opcionais `entidade`, `operacao`, `usuarioResponsavel` e `limite` (de 1 a 100). A configuração global aceita `aliquotaImposto` entre 0 e 100 e `coeficienteDepreciacao` entre 0 e 1.

## Versionamento otimista e exclusões

Os registros versionados começam em `versao: 0`. PUT/PATCH recebe a versão atual no corpo:

```json
{
  "versao": 0,
  "valorMensal": 1250.0
}
```

DELETE recebe a versão atual como query string, por exemplo `DELETE /lotes/<id>?versao=0`. Se outro pedido alterou o registro, a API responde `409 CONFLITO_VERSAO`; consulte o registro novamente antes de tentar outra alteração.

Exclusões com dependências são recusadas para preservar integridade e histórico: lotes com equipamentos e equipamentos com movimentações retornam `409`. Organizações relacionadas a contratos ou lotes também não podem ser excluídas.

## Regras de negócio

- CNPJ é normalizado e validado, incluindo dígitos verificadores; valores duplicados são rejeitados.
- Contratos exigem vencimento igual ou posterior à assinatura e valor mensal não negativo.
- Contratos e lotes só podem ser criados para organizações ativas.
- A data de entrada do lote não pode ser futura nem ter mais de 90 dias.
- Equipamentos não aceitam peso ou preço negativos, e código de barras interno deve ser único.
- Equipamentos só podem entrar em desmonte depois de uma triagem concluída.
- Reduções de duas ou mais categorias no estado físico exigem justificativa, registrada no journal.
- Criações e alterações são gravadas junto com o journal em transação de banco.

Erros comuns: `400` para corpo inválido, `401` para token ausente/inválido/expirado, `403` para papel sem permissão, `404` para registro inexistente, `409` para duplicidade, conflito de versão ou vínculo que impede exclusão e `422` para regra de negócio.

## Testes e manutenção

Os testes unitários das regras de negócio:

```powershell
npm test
```

Os testes HTTP de integração percorrem a jornada de provisionamento, autenticação, permissões por papel, organizações, contratos, lotes, equipamentos, movimentações e journal. Eles usam a `DATABASE_URL` normal do projeto e criam identificadores exclusivos para os registros de teste. Ao final, removem somente as próprias organizações, contratos, lotes, equipamentos, movimentações, usuários e eventos de journal.

Com as migrations já aplicadas, execute:

```powershell
npm run test:integration
```

Se o banco já tiver usuários ativos, configure `AV2_TEST_ADMIN_USER` e `AV2_TEST_ADMIN_PASSWORD` com credenciais de um administrador de teste. A suíte também aceita `SEED_ADMIN_USER` e `SEED_ADMIN_PASSWORD` do `.env`. Ela não cria, altera nem remove a conta desse administrador; a autenticação atualiza apenas o campo normal de último acesso. Se não houver usuários ativos, a suíte testa o provisionamento inicial e remove a conta temporária criada.

Verificação estática de TypeScript:

```powershell
npm run typecheck
```

Outros comandos úteis:

```powershell
npm run db:generate
npm run db:migrate
npx prisma migrate status
```

O repositório inclui testes unitários de domínio e uma suíte HTTP de integração com PostgreSQL.

## Organização do código

- `src/routes`: definição de caminhos, schemas e permissões.
- `src/controllers`: entrada/saída HTTP e códigos de resposta.
- `src/services`: regras de negócio e transações.
- `src/repositories`: acesso ao Prisma/PostgreSQL.
- `src/prisma/schema.prisma`: modelos do banco.
- `src/prisma/migrations`: histórico de alterações do schema.
- `src/prisma/seed.ts`: criação idempotente do administrador inicial.

## AV3: análises, parceiros e processamento assíncrono

As rotas AV2 permanecem disponíveis com JWT. As novas rotas são separadas por superfície:

| Superfície | Autenticação | Rotas |
| --- | --- | --- |
| Pública v1 | Cabeçalho `x-api-key` | `GET /api/v1/public/traceability/:code`, `POST /api/v1/public/organizations/:organizationId/lots`, `GET/POST /api/v1/public/analytics/reports`, `GET /api/v1/public/analytics/reports/:runId`, `GET /api/v1/public/jobs/:taskId` e `/download` |
| Interna | JWT e papéis internos | `POST /api/v1/internal/analytics/:kind/jobs`, consulta de execuções/jobs e registro de observações, falhas, materiais recuperados e custos |
| Administrativa | JWT de administrador | `GET/POST/PATCH /api/v1/admin/partners`, criação de chave em `/api/v1/admin/partners/:partnerId/keys` e revogação em `/api/v1/admin/keys/:keyId` |

OpenAPI/Swagger está disponível em `/docs`. Os tipos de análise aceitos são `EFICIENCIA_OPERACIONAL`, `RENTABILIDADE` e `RUL`. Jobs retornam `202` com `taskId`; o worker persiste execução e relatório JSON/CSV. A API pública limita acesso às organizações associadas ao parceiro e exige os escopos `rastreabilidade:read`, `lotes:write` ou `relatorios:read`.

Para executar a aplicação AV3, configure no `.env`:

```env
DATABASE_URL="postgresql://usuario:senha@localhost:5432/AV2?schema=public"
JWT_SECRET="segredo-aleatorio-com-pelo-menos-32-bytes"
API_KEY_PEPPER="outro-segredo-aleatorio-com-pelo-menos-32-bytes"
REDIS_URL="redis://localhost:6379"
REPORTS_DIR=".data/reports"
```

Instale as dependências, gere o Prisma Client, aplique a migration e execute servidor/worker em processos separados:

```powershell
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

Em outro terminal:

```powershell
npm run worker
```

Redis 6.2+ ou serviço compatível deve estar ativo para processar jobs. Sem `REDIS_URL`, a API pode continuar respondendo às rotas AV2, mas jobs AV3 permanecem pendentes e são reconciliados quando o worker voltar. Configurar `OPERATIONAL_ANALYSIS_CRON` habilita execução periódica opcional da análise operacional; `REPORT_CLEANUP_CRON` e `REPORT_RETENTION_DAYS` controlam limpeza/expiração dos relatórios.

### Dados analíticos e interpretação

- Eventos de triagem são gravados a partir das alterações de status do lote. A duração usa transição `RECEBIDO` → `EM_TRIAGEM` até `TRIAGEM_CONCLUIDA`; lotes sem eventos históricos não têm duração reconstruída. O relatório os exclui em vez de inventar horários.
- Rentabilidade utiliza registros de materiais recuperados e custos por equipamento. O valor de mercado aparece separado e sua moeda não é inferida, porque o cadastro legado não informa moeda. O resultado expõe lucro, margem sobre valor bruto e retorno sobre custo; valores percentuais são calculados apenas para equipamentos com dados comparáveis na mesma moeda.
- RUL exige `metrica` e `limiar` escolhidos pela equipe/solicitante e ao menos três observações na mesma unidade para ajustar uma regressão linear por mínimos quadrados. Séries sem tendência degradante são marcadas inelegíveis. Registrar métrica, unidade e limiar com significado operacional consistente é responsabilidade de quem alimenta os dados.
- Observações, falhas, materiais e custos são registrados nas rotas internas `POST /api/v1/internal/equipment/:equipmentId/...`. Falha marcada como inservível atualiza o estado atual do equipamento e avalia previsões anteriores.

Administração inicial de parceiro: criar parceiro associado às organizações com `POST /api/v1/admin/partners`, emitir uma chave com escopos autorizados e guardar o segredo retornado uma única vez. Para rotacionar, emitir uma chave nova e revogar a anterior. Não registrar o segredo em logs.

### Limites operacionais conhecidos

- Filas e API dependem do Redis configurado para jobs. Metadados, resultados e estados ficam no PostgreSQL.
- O rate limit usa Redis compartilhado quando `REDIS_URL` está configurada; sem Redis, usa memória local por processo. A configuração Redis do rate limiter é fail-open durante indisponibilidade para manter a API disponível, então implantações que exigem bloqueio estrito devem monitorar Redis e definir sua política operacional.
- Arquivos ficam em `REPORTS_DIR` e expiram conforme configuração. Em implantação com API e worker em máquinas diferentes, o diretório precisa ser compartilhado; storage de objeto não está configurado nesta versão.
- Os indicadores estatísticos descrevem os dados registrados; não estabelecem causalidade entre operador e duração. Rentabilidade exige dados de custo/recuperação; RUL exige observações de saúde compatíveis.
