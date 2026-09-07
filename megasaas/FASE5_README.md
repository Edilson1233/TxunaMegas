# FASE 5 — Integração com o Tasker (Node.js)

## Objetivo
Ligar dados reais ao mecanismo já construído na Fase 4, disparar o USSD via Tasker, e
fechar o fluxo de resposta automática ao cliente que discutimos.

## O que foi entregue
- `src/tasker/`: `UssdCommand`/`UssdCommandStatus`, `UssdEvents`, `UssdCommandQueue`
  (fila em memória), `taskerAuth` (Bearer token), `RateLimiter`, `taskerHandlers.js`
  (3 funções puras testáveis sem Express), `server.js` (camada Express fina).
- Endpoints: `POST /api/v1/tasker/sms`, `GET /api/v1/tasker/commands/next` (polling —
  Tasker não tem IP público, por isso pergunta em vez de receber pedidos), `POST
  /api/v1/tasker/commands/:id/ack`.
- `PurchaseFlowCoordinator` estendido: enfileira USSD ao verificar com sucesso, e agora
  também **envia respostas reais** via `whatsAppProvider.sendText()` (opcional —
  testes continuam sem WhatsApp real) em cada etapa: alegação registada, rejeição
  imediata, verificação falhada, expiração, USSD concluído, USSD falhado.
- `PendingTransactionManager`: `destinationNumber` do comando USSD herda da alegação
  original do WhatsApp (nunca da SMS do operador), com fallback para o número que pagou.
- `Session.js`: nova transição `PROCESSING -> NOT_FOUND` (falha real do USSD).

## Decisões-chave
- Handlers HTTP como funções puras (sem Express) — testáveis por chamada direta.
- Tasker faz *polling*, backend nunca contacta o Tasker (sem IP público estável).
- Defesa em profundidade: o payload que o Tasker envia tem de bater certo com o que o
  nosso próprio `MpesaParser` extrai do `rawSms` — rejeita se não coincidir.

## Testes: 66 no total (`npm test`)
28 novos nesta fase, incluindo idempotência ponta-a-ponta, ciclo completo até
`COMPLETED` via USSD, falha do USSD, e confirmação de que as mensagens certas são
enviadas ao cliente em cada etapa.

## Riscos conhecidos
- Fila USSD e rate limiter em memória — Fase 7 (Redis/BullMQ) resolve.
- "Transações órfãs" (SMS chega antes da alegação) são aceites mas não guardadas para
  cruzamento tardio — candidato para Fase 6.

## Como continuar
Numa conversa nova, cola o `PROJECT_CONTEXT.md` + `ROADMAP.md` e diz:
> "Continua na FASE 6 — Integração Spring Boot"
