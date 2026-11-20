# GreenCode AV3 — especificação técnica consolidada

**Status:** planejamento técnico; não é schema Prisma definitivo nem implementação.  
**Base analisada:** repositório AV2 e `AV3.pdf` fornecido em `C:/Users/Vinicius/Downloads/AV3.pdf`.  
**Classificação:** “Exigência expressa” significa texto explícito no PDF; “Recomendação técnica” é uma proposta para atender ao requisito com segurança; “Pendência” requer evidência ou decisão da equipe.

## Escopo e hierarquia das instruções

O AV3 pede uma camada analítica, uma API pública documentada e processamento assíncrono, além de justificar escolhas arquiteturais em relatório técnico. Sua solicitação atual limita este trabalho à especificação: não gerar código, não criar migrações definitivas nem começar a implementação. Portanto, esta especificação atende à etapa de planejamento, mas não substitui a entrega final de código e relatório descrita pelo professor.

O documento do professor é a fonte para classificar exigências acadêmicas. Sua solicitação define a tarefa desta etapa e exige separar exigências de recomendações e pendências. A stack e os detalhes da AV2 abaixo foram conferidos nos arquivos disponíveis, sem presumir características que não aparecem neles.

## 1. Visão geral e escopo da AV3

O PDF descreve a evolução do GreenCode transacional para uma plataforma analítica e integrada, mantendo Node.js, TypeScript e Prisma na camada analítica. Os três pilares são:

1. **Análises:** eficiência operacional; rentabilidade por tipo de equipamento; previsão de vida útil remanescente (RUL).
2. **API pública para parceiros:** rastreabilidade, submissão de lotes e relatórios analíticos, com API Keys, permissões, rate limiting, documentação e versionamento.
3. **Jobs assíncronos:** fila e worker para relatórios demorados, com ID de tarefa, acompanhamento, resultado para download e possibilidade de execução agendada.

O PDF cita `simple-statistics` e `mathjs` como alternativas, `@fastify/rate-limit` e `@fastify/swagger` para aspectos da API, BullMQ/Redis para filas e `node-cron` como alternativa de agendamento. São opções apresentadas pelo enunciado, não uma ordem para instalar todas. A escolha deve ser justificada com base na AV2 e no volume/complexidade esperado.

## 2. Requisitos funcionais e não funcionais

| ID | Requisito e classificação | Como atender | Módulos afetados | Evidência de atendimento |
|---|---|---|---|---|
| F1 | Produzir métricas de eficiência operacional por lote, operador ou período — **exigência expressa no PDF** | Definir eventos válidos de início/conclusão, calcular duração, tratar incompletos e agregar por grupos comparáveis | Lotes, eventos/journal, análise operacional | Casos matemáticos conhecidos, registros incompletos e resultados segmentados com tamanho da amostra |
| F2 | Estimar valor médio de recuperação por tipo, estado, marca e modelo — **exigência expressa no PDF** | Definir valor de recuperação a partir de dados de materiais/preços; não derivar de `precoMercado` sem regra | Equipamentos, recuperação, análise financeira | Cálculo reproduzível e exibição da origem, recorte e quantidade de dados |
| F3 | Projetar RUL usando regressão simples ou suavização exponencial e dados históricos — **exigência expressa no PDF** | Definir série, evento de inservibilidade, critérios de elegibilidade, método e validação | Observações, falhas, previsões | Testes de cálculo, dados insuficientes e comparação retrospectiva com resultados reais |
| F4 | Persistir resultados em novas tabelas e permitir consulta histórica/comparação com realizações — **exigência expressa no PDF** | Armazenar execução, período, parâmetros, versão do método, resultados e avaliações posteriores | Análises, previsões, resultados | Consultar execuções antigas e relacionar previsão com evento real sem sobrescrever histórico |
| F5 | Disponibilizar rastreabilidade, submissão de lotes e relatórios a parceiros — **exigência expressa no PDF** | Expor rotas públicas versionadas protegidas por chave e escopo | API externa, lotes, relatórios | Testes de autorização e integração por chave |
| F6 | API Keys únicas por parceiro, permissões específicas, rate limiting e documentação OpenAPI/Swagger — **exigência expressa no PDF** | Chaves gerenciáveis, autorização por escopo, limites configuráveis e documentação dos contratos públicos | Parceiros, auth externa, rotas | Testes de chave, escopo, limite e contrato OpenAPI |
| F7 | Separar rotas públicas, internas e administrativas; versionar explicitamente e evoluir versões antigas — **exigência expressa no PDF** | Usar prefixos distintos e política documentada de compatibilidade/descontinuação | Rotas, API pública, administração | Verificação de prefixos, documentação de versão e contratos de regressão |
| F8 | Retornar ID para operações demoradas, processá-las em worker e disponibilizar estado/resultado — **exigência expressa no PDF** | Persistir job, enfileirar e oferecer polling ou webhook; disponibilizar CSV/JSON quando concluído | Jobs, worker, relatórios, API | Testes de ciclo completo, autorização do status/download, recuperação e repetição |
| F9 | Permitir tarefas agendadas — **exigência expressa como possibilidade funcional no PDF** | Usar agendador compatível com a operação escolhida; evitar slots duplicados | Scheduler, worker, análises | Execução por janela e teste de concorrência do agendador |
| NF1 | Preservar base AV2 e JWT interno — **decisão técnica desta especificação, coerente com o pedido do usuário** | API Key independente para parceiros; sem substituição do JWT interno | Auth, rotas | Regressão de fluxos AV2 e testes independentes de cada autenticação |
| NF2 | Isolar parceiros e organizações — **recomendação técnica necessária** | Autorizar cada consulta/escrita pelo vínculo parceiro-organização | Auth externa, repositories, parceiros | Testes negativos de isolamento entre parceiros/organizações |
| NF3 | Qualidade e validação estatística — **recomendação técnica** | Testes unitários, integração, dados extremos/incompletos e avaliação preditiva | Serviços analíticos, integração | Resultados comparados a casos conhecidos e métricas de validação registradas |
| NF4 | Windows 10+ e Ubuntu 24.04.03+ — **exigência expressa no PDF** | Documentar e validar instalação, migração e execução nesses sistemas | Scripts, Prisma, servidor, worker, Redis | Registro da execução nos dois sistemas; versões devem ser conferidas no PDF/equipe |
| NF5 | Operabilidade e recuperação — **recomendação técnica** | Configuração por ambiente, logs, estado persistido, monitoramento e retenção definida | Servidor, worker, jobs, storage | Testes de indisponibilidade/reinício e instruções reproduzíveis |

## 3. Estado atual da AV2

### Stack e estrutura

O package.json contém Fastify 5, Prisma 7, `@prisma/adapter-pg`, `pg`, JWT e TypeScript. Não lista bibliotecas estatísticas, rate limiting, Swagger/OpenAPI, Redis, BullMQ ou node-cron. Essa ausência no manifesto analisado não prova que não exista serviço externo configurado; ainda assim, nenhuma dessas dependências aparece no package.json do projeto. O README documenta migrations, seed, testes e camadas.

Há `auth`, `controllers`, `repositories`, `routes`, `services`, `types`, `lib` e `integration`. Existem rotas/serviços/repos para organização, contrato, lote, equipamento, movimentação, journal, configuração e usuário. Há teste unitário das regras de negócio e teste HTTP de integração. O README contém afirmações contraditórias sobre a existência de testes HTTP integrados; o arquivo `src/integration/api.integration.test.ts` confirma que há uma suíte de integração no repositório.

### Modelo e eventos existentes

- `Lote`: `dataEntrada`, `statusProcessamento`, observações, versão, organização e equipamentos. O enum contém `RECEBIDO`, `EM_TRIAGEM` e `TRIAGEM_CONCLUIDA`; não há timestamps explícitos de início/conclusão nem operador do lote.
- `Equipamento`: tipo, marca, modelo, ano, estado, peso, `precoMercado`, status, `triagemCompleta` e lote. Não foram identificadas estruturas dedicadas a histórico de falhas, medições de degradação, recuperação de materiais ou custos.
- `Movimentacao`: data/hora, origem, destino, responsável textual, observação e equipamento. O serviço preenche responsável com o nome do usuário logado; a movimentação representa movimentação física, não necessariamente triagem.
- `JournalTransacao`: data/hora, operação, entidade, dados antes/depois em JSON e usuário relacionado por FK. Os serviços examinados registram alterações usando `executarComJournal` na mesma transação. É candidata a fonte de transições, mas cobertura histórica, mutações por rotas ainda não verificadas e formato real dos snapshots precisam ser auditados antes de usá-la em métricas.
- `ConfiguracaoSistema`: `aliquotaImposto` e `coeficienteDepreciacao`; o coeficiente não forma série histórica nem define o limiar de inservibilidade.
- `Organizacao`: empresa cliente ligada a contratos e lotes. Não deve ser tratada automaticamente como parceiro de integração.

JWT interno verifica token e sessão, aplica papéis (`ADMINISTRADOR`, `OPERADOR_CADASTRO`, `GESTOR_ALMOXARIFADO`, `AUDITOR`) e renova token no cabeçalho `x-renewed-token`. `server.ts` já implementa encerramento controlado. O sistema atual usa versionamento otimista em entidades selecionadas e journal transacional.

A árvore contém `src/generated/prisma` (saída apontada pelo schema) e `src/src/generated/prisma`, segunda cópia cuja origem/finalidade não foi comprovada. Investigar imports, histórico Git e geração antes de limpar/reorganizar.

## 4. Regras matemáticas e estatísticas

### 4.1 Eficiência operacional

**Início recomendado:** transição registrada do lote de `RECEBIDO` para `EM_TRIAGEM`. `dataEntrada` é recebimento, não início do processamento. Se a medição desejada for por equipamento, definir evento de início no nível do equipamento; não inferi-lo do lote.

**Conclusão recomendada:** transição registrada para `TRIAGEM_CONCLUIDA`, apenas quando todos os itens elegíveis estiverem triados. Hoje o sistema permite alterar status/flag, mas não assegura timestamp e ator próprios para esses eventos. O evento precisa ser validado no serviço e gravado em histórico confiável.

Para início (t_i) e fim (t_f), duração (d=t_f-t_i). Se o fim estiver ausente, for anterior ou igual ao início, o registro não entra na duração concluída e deve ser contado em categoria de qualidade de dados. A duração negativa nunca deve ser corrigida silenciosamente.

- **Média:** estima tempo médio/carga, mas é sensível a atrasos extremos.
- **Mediana:** representa o caso típico em distribuição assimétrica; publicar junto da média quando houver divergência relevante.
- **Extremos:** sinalizar com critério robusto, por exemplo IQR, para revisão. Não descartar automaticamente: pode ser gargalo operacional legítimo.
- **Desvio padrão:** usar para dispersão quando a amostra e distribuição tornam a média interpretável; mostrar também número de observações e período.
- **Operadores/períodos:** comparar grupos equivalentes em volume, tipo e período. Relatar quantidade de lotes; diferença observada não demonstra causalidade do operador.
- **Incompletos:** excluir da duração concluída, reportar quantos seguem em andamento e há quanto tempo. Não usar duração zero.
- **Ausentes/inconsistentes:** excluir do cálculo afetado, indicar contagem/motivo e não imputar sem regra aprovada.
- **Reabertura:** decidir se a duração é primeira entrada até conclusão final ou soma de intervalos em triagem.

O journal pode reconstruir início/fim apenas se a auditoria confirmar transições completas, ordenáveis e semanticamente estáveis. Caso contrário, preferir registro explícito de eventos do ciclo de triagem. Não introduzir timestamp duplicado no lote antes dessa auditoria.

### 4.2 Rentabilidade por tipo de equipamento

- **Preço de mercado:** preço estimado do equipamento como produto no estado e data de referência. `precoMercado` existe, mas o schema não registra sua fonte ou data. Não equivale a valor de recuperação.
- **Valor bruto estimado de recuperação:** valor dos materiais/componentes recuperáveis antes de custos. Uma possível fórmula seria Σ (quantidade recuperável × preço de referência por unidade); dados, fatores e fonte precisam ser decisão de negócio, não inferência do AV3.
- **Custo de recuperação:** custos atribuíveis como mão de obra, triagem, transporte, desmontagem, peças, tratamento e descarte, conforme escopo definido. Hoje não há esses custos identificados no schema.
- **Lucro estimado:** valor bruto menos custos que a equipe incluir. Impostos/despesas indiretas dependem de decisão explícita.
- **Rentabilidade:** razão percentual precisa de denominador aprovado. Exemplos de alternativas são lucro/custo (retorno sobre custo) ou lucro/valor bruto (margem); o PDF não escolhe uma delas.

Não criar preços por marca, fatores de desconto por estado ou percentuais sem fonte e justificativa. A análise pode segmentar pelos atributos existentes, mas precisa de dados de recuperação/custos para calcular rentabilidade. O resultado deve informar se valores são observados ou estimados, fonte/data, recorte e quantidade da amostra.

### 4.3 Previsão de vida útil remanescente

Dados necessários: observações datadas de condição/degradação com escala/unidade, histórico de falhas e reparos, critério operacional de inservibilidade, instante do evento real e indicação de equipamentos ainda ativos no fim do período (censura). Estado físico categórico não deve ser convertido em escala numérica equidistante sem validação; ano de fabricação não é data exata de início de uso.

**Regressão linear e MQO:** regressão linear representa a variável observada em função do tempo, por exemplo (y(t)=β_0+β_1t). Mínimos quadrados ordinários é uma forma de ajustar os coeficientes da reta. Se houver um limiar de inservibilidade validado e a tendência for compatível, a interseção com esse limiar pode estimar tempo restante. O método é simples e explicável, mas sensível a ruído, mudanças abruptas, manutenção e extrapolação distante.

**Suavização exponencial simples (SES):** estima nível recente, não tendência explícita. Pode suavizar uma série, mas não é, sozinha, adequada para projetar deterioração com tendência. Holt adiciona tendência, mas exige intervalos coerentes e ainda supõe trajetória regular. Dados irregulares exigem tratamento temporal explícito.

**Recomendação proporcional:** começar com baseline de regressão linear/MQO somente para séries numéricas válidas. Duas observações distintas bastam algebricamente para uma reta, mas não para estabelecer qualidade preditiva. A quantidade operacional mínima, intervalos aceitáveis e horizonte máximo precisam de validação nos dados reais. Sem dados adequados, retornar “insuficiente para estimar”, não inventar valor. Não introduzir modelos sofisticados antes de testar esta linha de base.

Guardar cada previsão com equipamento/coorte, data de corte, método/versão, parâmetros, horizonte e estimativa. Ao ocorrer inservibilidade observável, registrar o evento real e criar avaliação ligada à previsão, sem alterar a previsão original. Comparar erro temporal em avaliações retrospectivas; equipamentos ainda operacionais são censurados, não falhas nem acertos. Apresentar previsão como estimativa sujeita a incerteza.

## 5. Arquitetura proposta

Preservar as camadas atuais. Separar serviços de obtenção de dados (repositórios e composição de datasets), serviços puros de cálculo, serviços de aplicação/orquestração, persistência de execuções/resultados e endpoints de consulta. Execução manual e agendada devem chamar os mesmos serviços de aplicação e regras matemáticas.

Endpoints podem atender sincronamente consultas simples e análises pequenas. Cálculos de milhares de equipamentos e geração de arquivo devem enfileirar job. O servidor retorna ID; worker calcula; endpoint consulta estado; resultado pronto fica disponível com autorização. Servidor e worker podem compartilhar módulos, mas rodar como processos separados para o trabalho longo não bloquear HTTP.

## 6. Modelagem conceitual PostgreSQL/Prisma

Sem schema definitivo nesta etapa. As entidades abaixo são opções justificadas, não uma ordem para criar todas.

| Entidade conceitual | Finalidade, atributos e relações | Justificativa/controle de redundância |
|---|---|---|
| Parceiro API | Identidade, nome, estado e metadados; 1:N com chaves e M:N com organizações | Parceiro é consumidor técnico, organização é cliente operacional; não sobrecarregar `Organizacao` |
| Acesso parceiro-organização | FKs, estado/período do vínculo; unicidade do par | Allowlist explícita evita acesso global implícito |
| Chave API | ID, prefixo, hash, escopos, criado/expira/revoga, último uso e parceiro | Segredo exibido uma vez; armazenar somente hash/verificador e identificador público |
| Evento de triagem | Lote/equipamento, instante, estado anterior/novo e ator | Criar apenas se o journal não provar cobertura suficiente; evita deduzir timestamps |
| Observação de equipamento | Equipamento, data, métrica, valor/unidade, origem e ator | Necessária para série histórica de RUL; índice por equipamento/data |
| Falha/degradação | Equipamento, evento, severidade, data, reparo e possível inservibilidade | Separar de observação se negócio distinguir falhas de medições |
| Recuperação e custo | Equipamento/lote, material, quantidade, preço de referência ou custo, data e fonte | Necessária quando houver dados efetivos para rentabilidade; não misturar com preço de mercado |
| Execução analítica e resultado | Tipo, filtro/organização, janela/data de corte, parâmetros, versão do método, estado e métricas | Preserva histórico e proveniência; métricas frequentemente consultadas devem ser pesquisáveis, não somente JSON |
| Previsão e avaliação | Equipamento/coorte, previsão, data de corte, método, limiar, evento real e erro | Preserva previsão original e comparação posterior |
| Tarefa assíncrona | ID, tipo, estado, progresso, tentativas, erro resumido, datas e idempotência | PostgreSQL mantém status mesmo que Redis reinicie |
| Relatório gerado | Formato, localização, checksum/tamanho, criação e expiração; relação com tarefa/execução | Controla download e retenção; pode ser simplificado se houver um único arquivo por job |

Recomendações de integridade: FKs; restrição única para chave idempotente e slot recorrente; índices orientados a consultas observações por equipamento/data, execução por tipo/período/organização e jobs por estado/data; Decimal para valores monetários; moeda definida; timestamps UTC; exclusões que preservem histórico. Avaliar índices e retenção com volume real, sem particionar prematuramente. Considerar versionamento otimista em alterações concorrentes.

## 7. Contratos e segurança da API pública

### Parceiros, chaves, escopos e isolamento

Recomenda-se entidade própria `ParceiroAPI` e relação associativa explícita com organizações. Um parceiro pode ter acesso a uma ou mais organizações autorizadas; uma organização não é acessível por estar simplesmente cadastrada.

Gerar chaves aleatórias de alta entropia, exibir segredo uma única vez e persistir hash/verificador, prefixo, escopos e ciclo de vida. Revogar imediatamente; renovar criando chave nova e revogando a antiga após janela de transição decidida. Nunca registrar segredo em logs. Validar estado/validade, escopo e organização em cada request, incluindo status e downloads.

| Operação | Escopo proposto | Restrição obrigatória |
|---|---|---|
| Consultar rastreabilidade | `rastreabilidade:read` | Equipamentos/lotes apenas das organizações associadas |
| Submeter lote | `lotes:write` | Organização deve estar autorizada; validações e idempotência de submissão |
| Consultar relatórios | `relatorios:read` | Execuções/resultados apenas das organizações permitidas |

Nomes são sugestão para decisão da equipe. Leitura não implica escrita; acesso a relatório não deve conceder acesso a todos os clientes.

### Rotas e respostas

Separar rotas públicas, internas e administrativas em prefixos distintos, por exemplo `/api/v1/public`, `/api/v1/internal` e `/api/v1/admin`, mantendo autenticação específica por superfície. Versionamento explícito por URL é simples de operar; definir período de suporte e processo de descontinuação gradual. Gerar OpenAPI com exemplos, respostas e erros.

Padronizar erros com código estável, mensagem segura e correlation ID; paginação e limites de payload explícitos. Rate limit por chave/parceiro e fallback por IP; valor e janela são configuração pendente. Evitar detalhes internos ou stack trace na resposta pública.

### Segurança complementar

Validar schemas e parâmetros, restringir filtros/paginação, aplicar autorização nos repositórios, auditar operações sensíveis sem guardar segredos, usar TLS nos ambientes integrados e proteger arquivos. Para webhook: URL/saída validadas, assinatura HMAC, tentativas e conteúdo mínimo. Webhook é alternativa; polling é suficiente para primeiro fluxo se a equipe optar assim.

## 8. Processamento assíncrono

BullMQ/Redis é compatível com stack Node e é opção explícita no PDF. Traz dependência operacional adicional. Recomenda-se um worker separado e um único fluxo de fila, mantendo estado e resultados consultáveis no PostgreSQL.

Estados sugeridos: `PENDENTE`, `EM_EXECUCAO`, `CONCLUIDA`, `FALHA_FINAL`, opcionalmente `CANCELADA`; retentativas transitórias podem retornar a pendente. Persistir progresso, tentativas, timestamps e erro resumido. Erros determinísticos de validação não devem ser repetidos; falhas transitórias podem usar limite e backoff configurados.

Gravar tarefa e chave idempotente antes de confirmar a solicitação. O handler deve suportar repetição sem duplicar resultado/notificação. Se PostgreSQL estiver indisponível, não confirmar job nem sucesso sem persistência. Se Redis estiver indisponível, retornar indisponibilidade ou manter tarefa pendente recuperável por reconciliação idempotente; não declarar tarefa enfileirada sem enfileirar.

Polling deve verificar dono/escopo, expor estado/progresso e liberar link apenas ao concluir. Webhooks podem ser fase posterior, assinados e com retry. Arquivos CSV/JSON podem ficar num diretório configurado em implantação single-host, com nomes imprevisíveis, autorização no download, expiração e limpeza. Se worker/API operarem em hosts diferentes, storage local não compartilhado não basta; storage compartilhado torna-se uma decisão necessária.

Agendamentos devem ter chave única por tipo, escopo e janela temporal. Unicidade persistida e claim/lock impedem duplicidade com duas instâncias. `node-cron` é alternativa simples para instalação única; se houver múltiplos agendadores, o banco deve arbitrar a execução. Outbox é uma opção para garantia mais forte de publicação no Redis; considerar somente se registro pendente + reconciliação não atenderem ao nível de confiabilidade definido.

## 9. Testes, qualidade e operação

Planejar testes unitários dos cálculos e regras de ausência/extremos; integração com PostgreSQL; autorização e isolamento parceiro-organização; API OpenAPI; regressão dos fluxos JWT da AV2; RUL com série insuficiente, tendência e equipamentos censurados; jobs com repetição, backoff, falha final, reinício, Redis/PostgreSQL indisponíveis e concorrência de agendamento; arquivos com autorização, expiração e limpeza.

Operação deve documentar variáveis para banco, JWT, verificador/pepper de API Keys, Redis, diretório e retenção dos relatórios. Separar comandos de servidor e worker, descrever migrações e inicialização, health checks, logs estruturados por correlation ID/job ID, métricas de fila e recuperação após falhas. Não guardar segredos em repositório/logs.

O PDF exige Windows 10+ e Ubuntu 24.04.03 ou superior. Validar nesses dois sistemas a instalação e execução do servidor, Prisma, migrações, worker e dependências escolhidas. O package.json não declara versão mínima de Node; definir após confirmar os requisitos e executar a matriz nos sistemas-alvo. Redis pode requerer modo documentado de instalação/serviço compatível com cada ambiente; isso depende da escolha efetiva.

## 10. Rastreabilidade dos requisitos

| Requisito | Evidência concreta para aceite | Dependência principal |
|---|---|---|
| Eficiência operacional | Relatório com duração, média/mediana, dispersão, amostra, incompletos e período | Evento confiável de início/fim e atribuição de operador |
| Recuperação/rentabilidade | Componentes separados de mercado, valor bruto, custo, lucro e rentabilidade | Preço/material/custos e fórmula acordada |
| RUL | Previsões históricas e avaliação posterior com método, corte e evento real | Observações e critério de inservibilidade |
| API pública | OpenAPI e operações de rastreabilidade, lote e relatório autorizadas por chave | Modelo parceiro, chaves, escopos e organizações |
| Jobs | ID, status/progresso, tentativas, resultado e download restrito | Redis/fila, persistência, storage e worker |
| Compatibilidade AV2 | Rotas internas e JWT seguem funcionando na regressão | Implementação aditiva e suíte atual |
| Segurança | Testes negativos de escopo/isolamento, chaves revogadas e download indevido | Repositórios sempre filtrando escopo autorizado |
| Windows/Ubuntu | Instalação, migração, servidor e worker documentados e executados nos dois | Versões oficiais e dependências selecionadas |

## 11. Plano de implementação após aprovação da especificação

| Etapa | Objetivo e dependências | Módulos e banco conceitual | Testes e critério de conclusão |
|---|---|---|---|
| 1. Conferir AV3 e auditar dados | Ler PDF completo e confirmar fluxos atuais; acesso a dados de teste | Serviços/repos de lote, equipamento, movimentação e journal; sem migração | Transições e limites da base legada documentados |
| 2. Fechar regras de negócio | Definir início/fim, reabertura, fórmula de rentabilidade, falha/inservível, escopos e parceiro | Especificação e contratos; sem schema final | Casos de exemplo e matriz de permissões aprovados |
| 3. Corrigir base histórica | Garantir eventos/observações necessários; depende de etapa 1–2 | Evento de triagem e/ou observação, apenas onde journal não atender | Testes provam ator, timestamp, integridade e cobertura |
| 4. Persistência analítica | Guardar execução, parâmetros, resultados e versões | Execução/resultados e índices aprovados | Histórico consultável e proveniência reproduzível |
| 5. Eficiência | Entregar duração e agregações com qualidade de dados | Serviços analíticos, eventos e resultado | Casos conhecidos, incompletos, outliers e grupos comparáveis |
| 6. Recuperação/rentabilidade | Implementar quando houver dados e fórmula | Recuperação/custos e agregados | Componentes reconciliam e estimativas são identificadas |
| 7. RUL | Só depois da série e limiar; iniciar por baseline validada | Observações, falhas, previsões e avaliações | Backtest temporal, censura e insuficiência tratados |
| 8. API de parceiros | Habilitar rotas documentadas e isolamento | Parceiros, vínculos, chaves, auth externa | Testes de escopo, chave, organização e regressão AV2 |
| 9. Jobs/worker/relatórios | Assíncrono para análises grandes | Tarefas, fila, worker, scheduler, arquivos | Retry, idempotência, recuperação, polling/download seguros |
| 10. Operação e aceite | Validar migrações, logs, retenção e SOs exigidos | Scripts, documentação e monitoramento | Instalação e execução reproduzíveis em Windows e Ubuntu |

## 12. Decisões que ainda não podem ser fechadas

1. **Semântica e granularidade da eficiência:** não sabemos se o indicador é por lote, equipamento ou ambos, nem como contar reabertura. Resolver com fluxo operacional e regra da equipe.
2. **Cobertura histórica do journal:** não foram inspecionados todos os fluxos/rotas e dados legados. Resolver com auditoria completa de services/repositories e amostra de snapshots reais.
3. **Parceiro versus organização:** o schema representa clientes, não integradores. Resolver com decisão sobre cardinalidade e contratos comerciais de acesso.
4. **Fórmula de rentabilidade e fonte de valores:** não há preços de materiais, custos, moeda, fatores ou denominador definidos. Resolver com regras e dados de negócio; não inventar percentuais.
5. **Dados de RUL e limiar de inservibilidade:** não há série histórica ou critério operacional documentado. Resolver com dados históricos, escala aprovada e evento de falha definido.
6. **Critérios mínimos de previsão:** quantidade de observações, intervalo aceitável, horizonte e erro máximo não podem ser escolhidos sem validação. Resolver com análise exploratória e aprovação da equipe.
7. **Escopos, limites e descontinuação da API:** o PDF pede permissões, rate limiting e versionamento, mas não fixa matriz/limites/prazos. Resolver com política de parceiros e capacidade operacional.
8. **Redis, storage, webhook e retenção:** escolhas dependem de hosts, volume e modo de operação. Resolver com ambiente-alvo e requisitos de disponibilidade/armazenamento.
9. **Pasta `src/src/generated`:** finalidade não comprovada. Resolver com imports, Git e configuração de geração antes de qualquer limpeza.
10. **Versões mínimas e matriz de sistemas:** confirmar versões exatas de Node/PostgreSQL e modo de executar Redis nos sistemas-alvo. Resolver com requisitos do curso e validação em Windows 10+ e Ubuntu 24.04.03+.

## Referências do workspace consultadas

- `src/prisma/schema.prisma`
- `package.json`, `prisma7.config.ts`, `app.ts`, `server.ts`
- `src/auth/autenticacao.ts`
- `src/services/lote.service.ts`, `equipamento.service.ts`, `movimentacao.service.ts`, `journal.service.ts`
- `src/repositories/lote.repository.ts`, `equipamento.repository.ts`, `movimentacao.repository.ts`, `journal.repository.ts`
- `src/routes/lote.routes.ts`, `equipamento.routes.ts`, `movimentacao.routes.ts`
- `src/integration/api.integration.test.ts`, `src/services/regras-de-negocio.test.ts`
- `README.md`, `.env.example`

