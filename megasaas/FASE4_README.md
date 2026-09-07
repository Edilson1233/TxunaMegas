# FASE 4 — SessionManager + PendingTransactionManager (Node.js)

## Objetivo da fase
Gerir o estado de cada conversa de compra (por `contextKey`) e o ciclo de vida das
alegações de pagamento — desde o momento em que o cliente manda o texto no WhatsApp até
à confirmação (ou rejeição) real, que só vai existir de facto a partir da Fase 5.

## Estrutura entregue
```
src/core/session/
├── SessionState.js              (enum: IDLE, AWAITING_VERIFICATION, PROCESSING, ...)
├── Session.js                   (máquina de estados com transições validadas)
├── SessionStore.js              (interface)
├── InMemorySessionStore.js
└── SessionManager.js

src/core/transactions/
├── TransactionEvents.js         (catálogo de eventos)
├── PendingTransactionStore.js   (interface)
├── InMemoryPendingTransactionStore.js
└── PendingTransactionManager.js (idempotência, cruzamento, expiração)

src/flow/
└── PurchaseFlowCoordinator.js   (liga tudo ao pipeline de eventos)

test/
├── session.test.js
├── pendingTransactionManager.test.js
└── purchaseFlowCoordinator.test.js
```

## Decisões arquiteturais e porquê

**1. Máquina de estados explícita, não um campo `status` solto**
`Session.transitionTo()` valida contra uma tabela de transições permitidas
(`IDLE → AWAITING_VERIFICATION → PROCESSING → COMPLETED → IDLE`, com o ramo
`NOT_FOUND`). Se algum código futuro tentar, por engano, mandar uma sessão de `IDLE`
direto para `COMPLETED` (ex: bug de ordem de eventos na Fase 5), a exceção é imediata e
clara — em vez de um bug silencioso que só se nota semanas depois em produção.

**2. Idempotência resolvida já nesta fase, não adiada**
Isto estava nos requisitos de segurança logo desde a primeira mensagem do projeto:
"idempotência por transactionId", "anti-duplicação". `PendingTransactionManager` mantém
um registo de `transactionId` já usados com sucesso e rejeita (`ALREADY_USED`) qualquer
tentativa de reaproveitar o mesmo id — mesmo antes de existir Tasker. Risco documentado:
esse registo vive só em memória por agora (perde-se com um reinício do processo) — a
Fase 7 (Redis) resolve isso sem tocar na lógica de negócio.

**3. Timeout configurável resolve a decisão que ficou em aberto na Fase 3**
Discutimos: se a alegação do cliente não bater com nada, respondemos logo "não
encontrado" ou damos uma margem, porque o Tasker pode demorar a reportar? Resposta
implementada: **30 segundos de tolerância por defeito** (configurável no construtor do
`PendingTransactionManager`). Só depois desse prazo é que uma alegação pendente é
considerada `NOT_FOUND`.

**4. `SessionStore`/`PendingTransactionStore` seguem o padrão já estabelecido**
Mesma abordagem *ports & adapters* do `WhatsAppProvider` (Fase 1): uma interface
abstrata, uma implementação em memória hoje. Quando a Fase 7 trouxer Redis, troca-se só
a implementação — nenhum consumidor (`SessionManager`, `PendingTransactionManager`,
`PurchaseFlowCoordinator`) precisa de mudar.

**5. O `PurchaseFlowCoordinator` NÃO envia respostas reais — e isto é deliberado**
Esta é a decisão mais importante da fase, e está documentada diretamente no código.
Sem a Fase 5 (Tasker), `resolveWithRealTransaction()` nunca é chamado com dados reais em
produção — só em testes. Se ligássemos `sendText()` agora, o sistema nunca conseguiria
responder "a processar" ou "megas transferidos" de forma legítima (porque nunca haveria
verificação real), e ligar a resposta "não encontrado" faria o bot mentir sistematicamente
a todos os clientes. Por isso: a **mecânica de estado está pronta, testada e correta**; a
Fase 5 só precisa de (a) chamar `resolveWithRealTransaction()` com dados reais do Tasker,
e (b) ligar `WhatsAppProvider.sendText()` aos eventos que o coordenador já escuta.

## Testes (31 no total — `npm test`)
Os 14 das Fases 2-3 continuam intactos. Os 17 novos cobrem:
- `Session`: nasce em `IDLE`; permite a sequência completa de transições válidas;
  rejeita transição inválida (saltar estados).
- `SessionManager`: cria sessão na primeira vez; reutiliza depois; isola contextKeys
  diferentes.
- `PendingTransactionManager`: regista alegação válida; rejeita sem `transactionId`;
  rejeita `transactionId` já usado (idempotência); confirma quando valor bate certo;
  rejeita quando valor não bate certo; devolve `null` se não há alegação pendente;
  expira corretamente após o timeout; não afeta alegações ainda dentro do prazo.
- **Integração** (`purchaseFlowCoordinator.test.js`): mensagem M-Pesa real leva a
  sessão a `AWAITING_VERIFICATION`; mensagem irrelevante não altera nada; ciclo completo
  até `PROCESSING` (simulando uma transação real da Fase 5); ciclo completo até
  `NOT_FOUND` por expiração.

## Riscos conhecidos
- Estado (sessões + alegações pendentes) só em memória — perde-se com reinício do
  processo, e não é partilhado se houver múltiplas instâncias. Resolvido na Fase 7.
- O `setInterval` de 5s em `src/index.js` que chama `checkExpired()` é uma solução
  simples, adequada para uma única instância; não é fiável em ambiente distribuído
  (a Fase 7 substitui por um job atrasado no BullMQ, que sobrevive a reinícios).
- Ainda não existe nenhuma verificação REAL — todo o teste do cruzamento
  alegação/transação é feito com dados simulados nos testes automatizados. Isto é
  esperado e correto para esta fase; a Fase 5 é que liga dados reais.

## Como testar localmente
```bash
npm test
```
Deves ver `# pass 31` e `# fail 0`.

Também podes correr `npm start` e testar no WhatsApp: envia uma das SMS reais e repara
nos logs `[PurchaseFlowCoordinator] alegação registada, a aguardar verificação real...`.
Como não há Tasker ainda, essa alegação vai ficar pendente e expirar sozinha 30 segundos
depois — vais ver o log `[PurchaseFlowCoordinator] alegação expirou sem confirmação`.
Isto é o comportamento esperado nesta fase.

## Como continuar para a Fase 5
Numa nova conversa (para poupar tokens), cola o conteúdo de `PROJECT_CONTEXT.md` e diz:
> "Continua na FASE 5 — Integração com o Tasker"
