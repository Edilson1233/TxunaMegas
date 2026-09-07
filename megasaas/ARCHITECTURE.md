# ARCHITECTURE.md

## Atualizacao Operacional

O Node.js ja possui uma integracao opcional com o Spring Core para pagamentos. Quando `CORE_API_BASE_URL` e `CORE_INTERNAL_API_TOKEN` estao configurados, claims WhatsApp e confirmacoes SMS sao enviadas ao Core por REST autenticado. Quando essas variaveis nao existem, o fluxo antigo em memoria continua ativo para testes locais com WhatsApp/MacroDroid.

Este documento descreve o estado real observado no código e a direção arquitetural aprovada para evolução incremental. O código continua a ser a fonte principal da verdade; documentação histórica das fases pode estar incompleta ou desatualizada.

## Estado Atual

O projeto implementado hoje tem dois módulos: o gateway Node.js existente e um esqueleto inicial Spring Boot em `core/`. O fluxo funcional continua no Node.js; o core Java ainda não está integrado ao gateway. PostgreSQL já está modelado via Flyway no core, mas não há base de dados local provisionada neste repositório. Redis/BullMQ ainda não foi implementado.

Fluxo real atual:

```text
Cliente WhatsApp
  -> BaileysProvider
  -> WhatsAppEvents.MESSAGE_RECEIVED
  -> PurchaseFlowCoordinator
  -> MpesaParser
  -> PendingTransactionManager
  -> UssdCommandQueue
  -> Tasker/MacroDroid via polling HTTP
  -> ACK USSD
  -> resposta WhatsApp

Tasker/MacroDroid
  -> POST /api/v1/tasker/sms
  -> taskerHandlers.handleSmsReport
  -> MpesaParser
  -> PendingTransactionManager.resolveWithRealTransaction
  -> EventBus
  -> PurchaseFlowCoordinator
```

## Módulos Atuais

```text
src/index.js
  Bootstrap do processo Node, Baileys, EventBus, stores em memória, servidor Tasker e verificação periódica de expiração.

src/whatsapp/
  provider/WhatsAppProvider.js
  provider/BaileysProvider.js
  events/WhatsAppEvents.js

src/mpesa/
  MpesaParser.js
  normalizeText.js
  parseAmount.js
  parseMpesaDateTime.js
  patterns/receivedPattern.js
  patterns/transferSentPattern.js

src/core/
  context/ContextKeyResolver.js
  dto/Transaction.js
  dto/ParserResult.js
  dto/PaymentVerification.js
  dto/PaymentProvider.js
  dto/TransactionType.js
  dto/TenantContext.js
  events/EventBus.js
  session/*
  transactions/*

src/tasker/
  server.js
  taskerHandlers.js
  taskerAuth.js
  RateLimiter.js
  UssdCommand.js
  UssdCommandQueue.js
  UssdEvents.js

src/flow/
  PurchaseFlowCoordinator.js
  replyMessages.js

core/
  pom.xml
  src/main/java/mz/megasaas/core/
  src/main/resources/db/migration/V1__create_core_schema.sql
  src/test/java/mz/megasaas/core/
```

Existe também `src/core/ussd/`, atualmente vazio.

## Funcionalidades Implementadas

- Ligação WhatsApp via Baileys, com QR, reconexão e limpeza de credenciais após logout real.
- EventBus local em memória com isolamento contra falhas de handlers.
- Parser M-Pesa para SMS `Recebeste` e `Transferiste`, incluindo valores, taxa, contraparte, saldo opcional, data/hora Maputo e número de destino anexado.
- DTOs canónicos em Node.js para parser, pagamento, tenant e transação.
- Sessões por `contextKey`, incluindo isolamento em grupos por `groupId::userId`.
- Fluxo de compra por WhatsApp: reconhecer comprovativo, pedir número de destino quando falta, registar alegação, aguardar confirmação e responder ao cliente.
- Receção de SMS real via Tasker/MacroDroid em `POST /api/v1/tasker/sms`.
- Autenticação Tasker por Bearer token global.
- Rate limiting em memória por header de autorização.
- Pending transactions em memória, com suporte a WhatsApp primeiro ou SMS primeiro.
- Idempotência em memória por `externalTransactionId` usado.
- Fila USSD em memória, polling por `GET /api/v1/tasker/commands/next` e ACK por `POST /api/v1/tasker/commands/:commandId/ack`.

## Limites E Dívida Técnica

- Não há persistência durável; reiniciar o processo perde sessões, pending claims, órfãs, idempotência, rate limit e fila USSD.
- Spring Boot existe apenas como esqueleto inicial; ainda não é System of Record do fluxo real.
- Há modelo relacional via Flyway, mas ainda não há PostgreSQL provisionado nem integração Node -> Spring.
- Não há Redis/BullMQ, retries persistentes, dead-letter queue, locks distribuídos ou timeouts robustos para comandos `DISPATCHED`.
- Não há multi-tenant real; `TenantContext.resolveForInstance()` devolve sempre `default-tenant`.
- Não há utilizadores, RBAC, dashboard/admin, produtos, pacotes, preços, pedidos formais, subscrições, billing ou auditoria.
- `PaymentProvider.EMOLA` existe como valor reservado, mas não há parser e-Mola.
- Não há comando WhatsApp como `.tabela`, `.pagar`, `.abrir` ou `.fechar`.
- `package.json` ainda descreve fases antigas e as dependências não estavam instaladas no ambiente analisado.
- O diretório `src/core/ussd/` está vazio; a implementação real está em `src/tasker/`.

## Riscos De Segurança

- O token Tasker é global e partilhado; em produção deve ser por dispositivo/tenant.
- A comparação de token é simples e não constant-time.
- Anti-replay usa timestamp, mas não há assinatura HMAC, nonce persistido ou request id.
- Idempotência em memória não protege contra replay após restart.
- Rate limit em memória não funciona em escala horizontal.
- Pagamentos e USSD ainda não têm auditoria persistente.
- A confirmação de pagamento deve restringir o fluxo de venda a transações recebidas (`RECEIVED`) quando o core for formalizado.
- Comandos USSD precisam de timeout, retry, deduplicação e política de falha operacional antes de produção.

## Arquitetura-Alvo

```text
Node.js - Automation/Integration Gateway
  WhatsApp
  SMS/MacroDroid/Tasker
  parsing de mensagens externas
  USSD
  gestão de dispositivos
  sessões voláteis de integração
  workers
  integrações externas
  Redis/BullMQ para filas, retries e jobs

Spring Boot - Core/System of Record
  tenants
  utilizadores
  autenticação/autorização/RBAC
  clientes
  produtos/pacotes
  preços
  pedidos
  pagamentos
  subscrições
  billing
  auditoria
  APIs dashboard/admin

PostgreSQL
  persistência principal do domínio

Redis/BullMQ
  infraestrutura assíncrona do lado Node.js
```

Comunicação inicial Node ↔ Spring Boot: REST API autenticada. Arquitetura orientada a eventos só deve ser introduzida quando houver necessidade real de desacoplamento, volume, fan-out ou garantias assíncronas que REST não resolva bem.

## Regras De Separação

- Node.js é dono da integração com sistemas externos e do trabalho operacional de automação.
- Spring Boot deve ser dono do estado persistente de negócio.
- O parser pode continuar em Node.js, mas a decisão persistente de pagamento/pedido deve migrar para Spring Boot.
- Não duplicar regras de negócio entre Node.js e Spring Boot. Quando uma regra passar para Spring, Node deve chamar o contrato do core.
- Redis/BullMQ não deve ser tratado como protocolo direto Java ↔ Node nesta etapa; é infraestrutura de jobs/workers do lado Node.

## Migração Incremental

1. Definir contrato REST autenticado Node → Spring para confirmação de SMS, alegação de pagamento, criação/atualização de pedido e resultado USSD.
2. Criar Spring Boot mínimo com PostgreSQL, migrations e entidades: tenant, device, customer, order, payment, ussd_command/audit_event.
3. Migrar idempotência para PostgreSQL com chave única por `tenantId + provider + externalTransactionId`.
4. Manter WhatsApp, Tasker e parser no Node, mas delegar decisões persistentes ao Spring.
5. Introduzir Redis/BullMQ no Node para fila USSD com retry, timeout, backoff e dead-letter.
6. Substituir stores em memória por adaptadores reais, mantendo interfaces onde fizer sentido.
7. Implementar credenciais por dispositivo/tenant e rate limiting distribuído.
8. Adicionar catálogo de pacotes, preços, comandos WhatsApp, e-Mola, dashboard/admin e billing.

Artefactos criados para iniciar esta migração:

- `contracts/core-api.openapi.yaml`: contrato REST interno Node -> Spring Boot.
- `docs/domain-model.md`: modelo mínimo de domínio/persistência do Spring Boot Core.
- `core/`: Spring Boot Core iniciado com autenticação interna, endpoint de tenant context,
  endpoints internos de pagamentos, idempotência persistida e migration PostgreSQL.

## Validação Atual

Testes executados no diagnóstico:

```powershell
npm.cmd test
```

Resultado observado: 75 testes passaram, 0 falharam.

Nota: `npm test` no PowerShell pode falhar por bloqueio de `npm.ps1`; usar `npm.cmd test` nesse ambiente.
