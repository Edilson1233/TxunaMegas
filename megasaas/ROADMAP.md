# ROADMAP.md — Estado do Projeto

> Atualiza este ficheiro no fim de cada fase (a IA fará isto por ti quando pedires
> "fecha a fase X"). Serve para retomares o trabalho numa conversa nova sem perder contexto.

## Estado Geral
Última fase concluída: **FASE 5**
Fase em curso: **FASE 6 — Integração Spring Boot**

## Backlog (não são fases confirmadas — ver PROJECT_CONTEXT.md secção 7)
Análise de um bot concorrente ("SPIDER BOT") registada: interface por comandos
(`.tabela`/`.pagar`/etc.), moderação de grupo, e-Mola lado a lado com M-Pesa, modelo de
subscrição do próprio bot. Nada disto está agendado numa fase ainda — fica para decisão
quando chegarmos perto da Fase 6/8.

## Histórico de Fases

### ✅ FASE 1 — WhatsApp Provider + eventos base (Node.js)
- Entregue: estrutura de projeto, `WhatsAppProvider` (interface), `BaileysProvider`
  (implementação), `EventBus`, `ContextKeyResolver`, bootstrap (`src/index.js`).
- Contratos criados: nomes/payloads dos eventos `whatsapp.message.received`,
  `whatsapp.connection.update`, `whatsapp.qr.generated`.
- Riscos conhecidos: reconexão do Baileys em produção precisa de storage persistente de
  sessão (ainda a usar `useMultiFileAuthState` local — trocar por storage remoto na Fase 8
  se houver múltiplas instâncias).
- **Correção pós-entrega**: `BaileysProvider` não passava um `logger` próprio ao
  `makeWASocket`, fazendo o Baileys usar o seu logger interno a nível `info` — gerava
  volume enorme de logs de sincronização de histórico. Corrigido: logger interno dedicado
  a nível `warn` + `shouldSyncHistoryMessage: () => false`.
- **Bug corrigido**: ao desconectar o dispositivo pelo WhatsApp (logout real, statusCode
  401), o código detetava corretamente mas não limpava `storage/auth` nem reconectava —
  reiniciar o processo tentava reusar credenciais mortas e falhava com 401 de novo, sem
  nunca gerar QR novo. Corrigido: em logout real, apaga-se `storage/auth` e reconecta-se
  automaticamente no mesmo processo, gerando QR fresco sem reiniciar manualmente.
- **Decisão confirmada pelo utilizador**: multi-dispositivo/multi-tenant WhatsApp fica
  para a Fase 8 (ver PROJECT_CONTEXT.md secção 2). Não trazer isto antecipadamente.
- Nada pendente para revisitar nesta fase.

### ✅ FASE 2 — Parser M-Pesa robusto (Node.js)
- Entregue: `src/mpesa/MpesaParser.js` (orquestrador), `MpesaMessageType.js` (enum),
  `normalizeText.js`, `parseAmount.js`, `parseMpesaDateTime.js` (utilitários), e dois
  padrões em `src/mpesa/patterns/`: `receivedPattern.js` ("Recebeste" — pagamento de
  cliente) e `transferSentPattern.js` ("Transferiste" — repasse do revendedor).
- Testes: `test/mpesaParser.test.js`, 7 casos (`npm test`), incluindo os dois exemplos
  reais fornecidos pelo utilizador e o caso limite real (saldo ausente + número de
  destino anexado). Todos os testes passam.
- Contrato de saída (ParserResult — shape estável, será formalizado como DTO na Fase 3):
  `{ matched, type, transactionId, amount, fee, counterpartyPhone, counterpartyName,
  occurredAt, balance, destinationNumber, warnings, raw, parserVersion }`.
- Integração: `src/index.js` já usa o parser como consumidor de exemplo do evento
  `MESSAGE_RECEIVED`, mas **apenas para inspeção/log em desenvolvimento** — não é validação
  de pagamento real (essa só existe a partir da Fase 5, via Tasker).
- Decisões importantes:
  - Estratégia de padrões extensível: cada tipo de SMS é um módulo isolado em
    `patterns/`, registado numa lista ordenada no orquestrador. Novo tipo de SMS não
    exige tocar nos padrões existentes.
  - `destinationNumber`: número de telemóvel moçambicano (9 dígitos, prefixo 8[2-7])
    encontrado DEPOIS da fronteira de fecho conhecida da SMS oficial (`liga 100...`).
    Representa o número que deve receber os megas, quando diferente de quem pagou.
  - Datas: M-Pesa MZ usa sempre ano de 2 dígitos e fuso de Maputo (UTC+2, sem DST) —
    convertido para ISO 8601 UTC de forma determinística (não depende do fuso da máquina).
  - Nunca lança exceção: texto não reconhecido devolve `matched:false` com warnings.
- Riscos conhecidos: só dois tipos de SMS cobertos até agora (Recebeste, Transferiste).
  Outros tipos reais (ex: pagamento a comerciante, levantamento ATM, compra de crédito)
  ainda não têm padrão — vão cair em `UNKNOWN` até serem adicionados.
- Nada pendente para revisitar nesta fase.

### ✅ FASE 3 — DTOs / Modelos de dados (Node.js)
- Entregue em `src/core/dto/`: `TransactionType.js` (enum canónico, movido do
  módulo mpesa), `PaymentProvider.js` (MPESA/EMOLA), `ParserResult.js` (classe
  formal, imutável, com factories `matched()`/`unknown()`), `Transaction.js`
  (com `TransactionSource` — WHATSAPP_TEXT vs TASKER_SMS — e `TransactionStatus`),
  `PaymentVerification.js` (com `PaymentVerificationReason`), `TenantContext.js`
  (`resolveForInstance()`, tenant único por defeito antes da Fase 8).
- `MpesaParser` (Fase 2) refatorado para devolver instâncias de `ParserResult`
  em vez de objetos literais — **shape idêntico**, os 7 testes da Fase 2
  continuam a passar sem alteração nenhuma (prova de que foi reformulação
  transparente, não mudança de comportamento).
- `MpesaMessageType.js` (Fase 2) agora reexporta `TransactionType` do core —
  caminho de importação antigo preservado, nada mais precisou de mudar.
- Testes: `test/dto.test.js`, 7 casos — incluindo a cadeia completa
  `SMS real -> MpesaParser -> ParserResult -> Transaction -> PaymentVerification`.
  Total agora: **14 testes** (`npm test`), todos a passar.
- Decisão de arquitetura mais importante desta fase: `Transaction.source`
  (`WHATSAPP_TEXT` | `TASKER_SMS`) torna a regra de ouro do projeto — nunca
  confiar em texto do WhatsApp para liberar megas — impossível de esquecer
  por acidente em código futuro (Fase 5): qualquer lógica que acione o USSD
  deve verificar `source === 'TASKER_SMS'` antes de agir.
- `src/index.js` atualizado para demonstrar a cadeia completa como inspeção
  (constrói `Transaction` com `source: WHATSAPP_TEXT` a partir de mensagens
  reais) — continua a NÃO ser validação de pagamento real.
- Nada pendente para revisitar nesta fase.

### ✅ FASE 4 — SessionManager + PendingTransactionManager (Node.js)
- Entregue em `src/core/session/`: `SessionState.js` (enum), `Session.js` (máquina de
  estados com tabela explícita de transições válidas: IDLE → AWAITING_VERIFICATION →
  PROCESSING → COMPLETED → IDLE, com ramo NOT_FOUND), `SessionStore.js` (interface),
  `InMemorySessionStore.js`, `SessionManager.js`.
- Entregue em `src/core/transactions/`: `TransactionEvents.js` (catálogo de eventos),
  `PendingTransactionStore.js` (interface), `InMemoryPendingTransactionStore.js`,
  `PendingTransactionManager.js` (registo de alegações, idempotência por
  `transactionId`, cruzamento com transação real, expiração por timeout configurável).
- Entregue em `src/flow/PurchaseFlowCoordinator.js`: liga parser M-Pesa (Fase 2) + DTOs
  (Fase 3) + SessionManager + PendingTransactionManager ao pipeline de eventos do
  WhatsApp (Fase 1). Escuta `MESSAGE_RECEIVED`, `CLAIM_VERIFIED`, `CLAIM_EXPIRED`.
- `src/index.js` atualizado: monta e liga tudo, com um `setInterval` simples a chamar
  `checkExpired()` a cada 5s (nota explícita no código: será substituído por job
  atrasado no BullMQ na Fase 7).
- Testes: `test/session.test.js`, `test/pendingTransactionManager.test.js`,
  `test/purchaseFlowCoordinator.test.js` — 17 casos novos. Total agora: **31 testes**
  (`npm test`), todos a passar. Inclui teste de integração completo (mensagem WhatsApp
  real → `AWAITING_VERIFICATION` → transação real simulada → `PROCESSING`, e também o
  ramo de expiração → `NOT_FOUND`).
- Decisões importantes:
  - Idempotência implementada já nesta fase: `PendingTransactionManager` mantém um
    registo de `transactionId` já usados e rejeita imediatamente (`ALREADY_USED`)
    qualquer nova alegação com o mesmo id — cumpre o requisito de segurança definido
    logo no início do projeto. Risco documentado: este registo só existe em memória
    (não sobrevive a reinício do processo) até à Fase 7 (Redis).
  - `SessionStore` e `PendingTransactionStore` seguem o mesmo padrão *ports & adapters*
    já usado em `WhatsAppProvider` (Fase 1) — implementações em memória hoje, Redis na
    Fase 7, sem reescrever `SessionManager`/`PendingTransactionManager`.
  - **Decisão sobre o "não encontrada" em aberto (ver ROADMAP Fase 3) foi resolvida**:
    timeout configurável (30s por defeito) antes de considerar uma alegação como não
    encontrada — dá tempo ao Tasker de reportar com atraso, em vez de responder
    negativamente de imediato.
  - `PurchaseFlowCoordinator` **NÃO envia respostas reais ao WhatsApp ainda** — decisão
    deliberada, documentada no próprio código: sem a Fase 5 (Tasker), nenhuma alegação
    seria alguma vez verdadeiramente confirmada, e ligar `sendText` agora produziria
    respostas falsas ao cliente. A mecânica de estado está pronta e testada; a Fase 5
    só precisa de chamar `pendingTransactionManager.resolveWithRealTransaction()` com
    dados reais, e então ligar o envio de mensagens.
- Nada pendente para revisitar nesta fase.

### 🔧 Correção pós-Fase 4 (bug real reportado pelo utilizador)
Ao testar no WhatsApp, mandar uma segunda SMS M-Pesa enquanto a primeira ainda estava
pendente derrubava o processo inteiro: `Session.transitionTo()` não permitia
`AWAITING_VERIFICATION -> AWAITING_VERIFICATION` (nem `NOT_FOUND -> NOT_FOUND`, nem
`COMPLETED -> AWAITING_VERIFICATION`), lançando uma exceção dentro de um handler
assíncrono do `EventBus` — que, sem tratamento, se torna uma "unhandled rejection" e
mata o processo Node.js **para todos os clientes**, não só para quem mandou a mensagem.
Duas correções: (1) `Session.js` — tabela de transições ampliada para cobrir cenários
reais; (2) `EventBus.js` — `on()` envolve cada handler em try/catch, registando o erro
em vez de deixá-lo derrubar o processo. Testes novos: `test/eventBus.test.js` (3 casos)
+ 3 casos adicionais. Total após esta correção: 38 testes.

### ✅ FASE 5 — Integração com o Tasker (Node.js)
- Entregue em `src/tasker/`: `UssdCommand.js` (+ `UssdCommandStatus`), `UssdEvents.js`
  (catálogo de eventos), `UssdCommandQueue.js` (fila em memória, mesmo padrão de risco
  documentado das fases anteriores — Redis/BullMQ na Fase 7), `taskerAuth.js`
  (`verifyTaskerToken`, Bearer token partilhado via `TASKER_API_KEY`), `RateLimiter.js`
  (janela deslizante em memória), `taskerHandlers.js` (3 funções PURAS, sem depender de
  Express — testáveis diretamente: `handleSmsReport`, `handleNextCommand`,
  `handleCommandAck`), `server.js` (camada Express fina que só trata transporte HTTP —
  autenticação, rate limit, e chama os handlers puros).
- Endpoints reais, cumprindo o contrato definido desde a Fase 1
  (PROJECT_CONTEXT.md secção 3):
  - `POST /api/v1/tasker/sms` — recebe SMS real, valida payload, anti-replay
    (timestamp com tolerância de 5 min), faz parsing via `MpesaParser` (Fase 2),
    confere que o payload bate com o que o parser extraiu (defesa em profundidade),
    constrói `Transaction` com `source: TASKER_SMS` e chama
    `PendingTransactionManager.resolveWithRealTransaction()` (já existia desde a
    Fase 4 — esta fase foi, na prática, ligar dados reais a um mecanismo já pronto).
  - `GET /api/v1/tasker/commands/next` — Tasker faz polling para saber se há USSD para
    executar (decisão de arquitetura: Tasker não recebe pedidos HTTP de entrada — não
    tem IP público estável — por isso faz polling em vez do backend empurrar comandos).
  - `POST /api/v1/tasker/commands/:commandId/ack` — Tasker confirma sucesso/falha da
    execução do USSD.
- `src/index.js` atualizado: cria `UssdCommandQueue`, arranca o servidor Express na
  porta `TASKER_PORT` (nova env var, com `TASKER_API_KEY` — aviso explícito no arranque
  se não estiver configurada).
- `PurchaseFlowCoordinator` estendido: ao verificar com sucesso, enfileira comando USSD
  (herdando `destinationNumber` da alegação original do cliente — nunca da SMS do
  operador, que não tem essa informação — com fallback para `counterpartyPhone` se o
  cliente não indicou destino); escuta `UssdEvents.COMPLETED` (→ `COMPLETED`) e
  `UssdEvents.FAILED` (→ `NOT_FOUND`, a escalar para suporte).
- `Session.js`: tabela de transições ganhou `PROCESSING -> NOT_FOUND` (falha real do
  USSD, cenário que não existia antes de haver Tasker).
- Testes novos: `test/ussdCommandQueue.test.js` (6), `test/taskerHandlers.test.js` (10,
  incluindo idempotência ponta-a-ponta), `test/taskerSecurity.test.js` (7, auth +
  rate limit), + 3 no `purchaseFlowCoordinator.test.js` (ciclo completo até
  `COMPLETED` via USSD, falha do USSD, destino explícito respeitado). Total: **65
  testes**, todos a passar.
- Decisões importantes:
  - Handlers HTTP como funções puras, sem Express — testadas diretamente por chamada
    de função, sem precisar de servidor a correr nos testes (mesma filosofia
    *ports & adapters* das fases anteriores, aplicada ao transporte HTTP).
  - Tasker faz **polling**, o backend nunca tenta contactar o Tasker diretamente —
    dispositivos Android atrás de NAT/rede móvel não são alcançáveis de fora.
  - `destinationNumber` do comando USSD vem sempre da alegação do WhatsApp (Fase 2),
    nunca da SMS do Tasker — só o cliente indica, através do texto que cola, se os
    megas são para um número diferente do que pagou.
- Riscos conhecidos: fila USSD e rate limiter em memória (mesma nota das fases
  anteriores — Fase 7 resolve com Redis/BullMQ); "transações órfãs" (SMS real chega
  antes de qualquer alegação no WhatsApp) são aceites mas não guardadas para
  cruzamento tardio — fica para a Fase 6.
- **Adição final da fase**: `PurchaseFlowCoordinator` agora envia mesmo as respostas
  reais ao cliente (`src/flow/replyMessages.js` + `whatsAppProvider.sendText()`,
  ligado via `ContextKeyResolver.parse()` para obter o `chatId`). Isto fecha o
  requisito original do utilizador (fluxo de resposta automática). Parâmetro
  `whatsAppProvider` é opcional no coordenador — testes continuam sem precisar de
  WhatsApp real. Teste dedicado confirma as duas mensagens enviadas num ciclo
  completo. Total final: **66 testes**.

### 🔧 Correção pós-Fase 5 (observação real do utilizador — cruzamento bidirecional)
O utilizador reparou que a arquitetura assumia sempre "WhatsApp primeiro, SMS depois"
— mas na realidade a SMS chega ao telemóvel do revendedor quase instantaneamente,
tipicamente ANTES de o cliente escrever/colar a mensagem no WhatsApp. Nesse caso
(comum, não raro), a SMS real ficava descartada como "órfã" sem ser guardada — se a
mensagem do WhatsApp chegasse depois, o cruzamento nunca acontecia.
Corrigido: `PendingTransactionManager` agora guarda transações reais órfãs
(`store.setOrphanReal`) em vez de as descartar; quando a alegação do WhatsApp chega
depois, `registerClaim()` verifica primeiro se já existe uma SMS órfã correspondente e
cruza de imediato (mesma lógica de valor/idempotência/destinationNumber, extraída para
`#finalizeMatch()`, partilhada nos dois sentidos). `checkExpired()` também varre e
expira órfãs esquecidas. `PurchaseFlowCoordinator` atualizado com `#advanceToProcessing()`
partilhado entre o caminho normal e o caminho de cruzamento imediato.
Também corrigido nesta ronda: `MpesaParser` tinha uma heurística ("se o número extra
coincide com a contraparte, é coincidência, ignorar") que descartava um destino
explicitamente indicado pelo cliente num caso real de teste — removida, nunca foi
necessária. Testes novos: 2 casos (idempotência ponta-a-ponta com ordem invertida +
integração completa). Total final: **68 testes**.

### 🔧 Correção pós-Fase 5 #2 (observações reais do utilizador — UX das respostas)
Duas melhorias pedidas depois de ver um bot concorrente em produção:
1. **Pedir o número de destino quando falta**: antes, se o cliente esquecesse de colar
   o número extra no fim da mensagem, o sistema caía silenciosamente para o número que
   pagou. Agora, novo estado `AWAITING_DESTINATION_NUMBER` — o bot pergunta
   explicitamente, valida a resposta (formato moçambicano exato), e só depois regista
   a alegação. Compõe corretamente com o cruzamento bidirecional já existente (se a SMS
   real chegar entretanto, fica órfã à espera na mesma).
2. **Mensagens ricas + citação da mensagem original**: `replyMessages.js` reescrito com
   campos reais (referência, valor, número, data/hora) em vez de texto genérico.
   `WhatsAppProvider.sendText()` ganhou um 3º parâmetro opcional `{ quoted }` (usa a
   opção nativa do Baileys) — as respostas dadas na mesma altura em que a mensagem do
   cliente chega (registo/pedido de número/rejeição) agora citam essa mensagem, tal
   como o concorrente mostrado pelo utilizador. Respostas assíncronas mais tarde
   (verificação, expiração, resultado do USSD) não citam — não há mensagem original
   disponível nesse momento sem complexidade adicional (fica para o futuro se for
   pedido).
Testes novos: 3 casos (novo estado, número em falta → pedido → resposta → prossegue,
número inválido → pedido repetido). Total final: **71 testes**.

### 🔧 Correção pós-Fase 5 #3 (observação real — prazo único era curto demais para a SMS órfã)
O utilizador testou a ordem invertida (SMS antes do WhatsApp) e reparou que, se a
mensagem do WhatsApp demorasse mais de 30s a chegar, a SMS órfã já tinha sido
descartada — o mesmo timeout (`30_000ms`) estava a ser usado para os dois lados do
cruzamento bidirecional, mas fazem sentidos completamente diferentes: uma alegação
espera por um sistema automático (Tasker/MacroDroid, deve responder em segundos); uma
SMS órfã espera por uma PESSOA a escrever no WhatsApp (pode demorar minutos).
Corrigido: `PendingTransactionManager` agora tem dois prazos independentes —
`claimTimeoutMs` (30s, inalterado) e `orphanTimeoutMs` (15 minutos, novo). Log de
expiração de órfã subido para nível `error` (é dinheiro real recebido e nunca
entregue — merece destaque para investigação manual/Fase 8).
**Nota importante documentada no código**: aumentar o prazo não resolve tudo —
o armazenamento continua em memória, por isso um reinício do processo perde os dados
na mesma, seja qual for o timeout. A solução definitiva é a persistência da Fase 7
(Redis). 15 minutos é o "melhor possível dentro do que a memória permite" — não uma
garantia de nunca perder uma SMS.
Testes novos: 2 casos (SMS órfã sobrevive ao prazo curto de alegação, mas expira no
seu próprio prazo mais longo). Total final: **73 testes**.

### 🔧 Correção pós-Fase 5 #4 (encontrada durante análise pedida pelo utilizador — disparo duplo)
O utilizador pediu para analisar se o caso "WhatsApp primeiro, SMS depois" estava
correto (estava). A análise revelou, de caminho, um bug real no caso inverso: quando
`registerClaim()` encontrava uma SMS órfã e confirmava o cruzamento internamente,
**emitia o evento `CLAIM_VERIFIED`** — mas o `PurchaseFlowCoordinator` já tratava esse
mesmo resultado diretamente pelo valor devolvido da chamada. Duas reações à mesma
confirmação, com risco de transições de estado em corrida (a segunda tentativa de
"avançar para PROCESSING" falhava, capturada pela proteção da Fase 4, mas gerava log de
erro espúrio e comportamento não determinístico).
Corrigido: `#finalizeMatch()` deixou de emitir eventos — passou a devolver só o
resultado. Cada chamador decide: `resolveWithRealTransaction()` (chamado pelo servidor
Tasker, sem acesso direto ao coordinator) continua a emitir `CLAIM_VERIFIED` — é o
único canal que tem para notificar. `registerClaim()` (chamado pelo coordinator
diretamente) já não emite nada — o coordinator trata tudo pelo valor devolvido, sem
indireção via evento.
Testes novos: 2 casos (confirma que `registerClaim` não emite o evento na órfã;
confirma que `resolveWithRealTransaction` continua a emitir exatamente uma vez).
Total final: **75 testes**.

### 🚧 FASE 6 — Integração Spring Boot (iniciada)
- Entregue primeiro incremento em `core/`: projeto Maven Spring Boot, configuração de aplicação,
  autenticação interna simples por Bearer token para `/internal/**`, endpoint inicial
  `GET /internal/v1/tenant-context/whatsapp-instances/{instanceId}` e testes Java
  correspondentes.
- Entregue segundo incremento no core: endpoints `POST /internal/v1/payment-claims` e
  `POST /internal/v1/payment-confirmations/sms`, serviço de decisão de pagamento,
  repositório JDBC, replay por `Idempotency-Key` e testes unitários do serviço.
- Entregue migration inicial `V1__create_core_schema.sql` com o modelo relacional alvo para
  tenants, utilizadores, memberships, instâncias WhatsApp, dispositivos de automação,
  idempotência, clientes, produtos/pacotes/preços, pedidos, pagamentos, claims,
  confirmações SMS, comandos USSD e auditoria.
- O fluxo funcional ainda continua no Node.js. O core ainda não está integrado ao gateway.
- Validação local: `pom.xml` parseado com sucesso; `npm.cmd test` continua com 75 testes a
  passar. `mvn test` não pôde ser executado porque Maven não está instalado/não está no PATH
  nesta máquina.
### ⏳ FASE 7 — Redis e BullMQ (não iniciada)
### ⏳ FASE 8 — Multi-tenancy, billing, painel admin (não iniciada)
  - Inclui: decisão final sobre 1 instância WhatsApp por tenant vs. pool partilhado
    (ver PROJECT_CONTEXT.md secção 2).
