# Modelo De Dominio Alvo

Este documento fixa o modelo minimo para iniciar o Spring Boot Core com PostgreSQL. O objetivo e retirar do Node.js a responsabilidade de ser fonte persistente de verdade, sem quebrar o gateway de automacao que ja existe.

## Fronteiras De Responsabilidade

Node.js continua responsavel por:

- WhatsApp/Baileys.
- Tasker/MacroDroid/SMS.
- Parsing tecnico de mensagens externas.
- Polling e ACK de comandos USSD.
- Workers, filas e retries quando Redis/BullMQ entrar.

Spring Boot passa a ser responsavel por:

- Estado persistente de tenants, dispositivos, clientes, pedidos, pagamentos e comandos.
- Idempotencia duravel.
- Decisoes de dominio sobre pagamento/pedido.
- Auditoria.
- APIs futuras para dashboard/admin.

## Entidades Minimas

### tenants

Dono logico de todos os dados de negocio.

Campos principais:

- `id` UUID.
- `slug` unico.
- `display_name`.
- `status`: `ACTIVE`, `SUSPENDED`, `DISABLED`.
- `created_at`, `updated_at`.

### users

Utilizadores da plataforma SaaS. Nao representa o cliente final do revendedor no WhatsApp.

Campos principais:

- `id` UUID.
- `email` unico.
- `password_hash`.
- `status`: `ACTIVE`, `DISABLED`.
- `created_at`, `updated_at`.

### tenant_memberships

Liga utilizadores a tenants e papeis.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `user_id`.
- `role`: `OWNER`, `ADMIN`, `OPERATOR`, `VIEWER`.
- `created_at`.

Restricao:

- Unico por `tenant_id + user_id`.

### whatsapp_instances

Instancias WhatsApp controladas pelo gateway Node.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `instance_id` unico.
- `display_name`.
- `status`: `ACTIVE`, `DISCONNECTED`, `DISABLED`.
- `created_at`, `updated_at`.

Restricao:

- Unico por `instance_id`.

### automation_devices

Dispositivos Android que reportam SMS e executam USSD.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `name`.
- `device_key_hash`.
- `status`: `ACTIVE`, `SUSPENDED`, `DISABLED`.
- `last_seen_at`.
- `created_at`, `updated_at`.

Restricoes:

- Credencial nunca guardada em texto puro.
- Dispositivo so pode operar para o seu `tenant_id`.

### idempotency_keys

Registo duravel das chaves de idempotencia recebidas em chamadas internas Node -> Spring.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `idempotency_key`.
- `operation`.
- `request_hash`.
- `response_status`.
- `response_body` JSONB.
- `created_at`, `expires_at`.

Restricao:

- Unico por `tenant_id + idempotency_key + operation`.

### customers

Clientes finais do revendedor, normalmente identificados por telefone/WhatsApp.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `phone_number`.
- `whatsapp_jid`.
- `display_name`.
- `created_at`, `updated_at`.

Restricao:

- Unico por `tenant_id + phone_number` quando `phone_number` existir.

### products

Produtos vendaveis pelo tenant, por exemplo pacotes de internet.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `name`.
- `description`.
- `status`: `ACTIVE`, `INACTIVE`.
- `created_at`, `updated_at`.

### product_packages

Pacotes concretos, por exemplo volume/duracao.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `product_id`.
- `name`.
- `allowance_mb`.
- `validity_days`.
- `status`: `ACTIVE`, `INACTIVE`.
- `created_at`, `updated_at`.

### prices

Preco por pacote e periodo de validade comercial.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `package_id`.
- `amount`.
- `currency`: `MZN`.
- `valid_from`.
- `valid_to`.
- `created_at`.

### orders

Pedido de compra do cliente final.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `customer_id`.
- `package_id`.
- `context_key`.
- `destination_number`.
- `amount_expected`.
- `status`: `PENDING_PAYMENT`, `PAYMENT_VERIFIED`, `PROCESSING_USSD`, `COMPLETED`, `FAILED`, `CANCELLED`, `EXPIRED`.
- `created_at`, `updated_at`.

Nota:

- No estado atual, o Node infere um pedido diretamente do comprovativo. Na migracao, Spring deve persistir esse pedido mesmo quando ainda nao existir catalogo completo.

### payments

Registo canonico do pagamento confirmado ou reclamado.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `order_id`.
- `provider`: `MPESA`, `EMOLA`.
- `external_transaction_id`.
- `transaction_type`: `RECEIVED`, `TRANSFER_SENT`, `UNKNOWN`.
- `amount`.
- `fee`.
- `counterparty_phone`.
- `counterparty_name`.
- `destination_number`.
- `balance_after`.
- `occurred_at`.
- `status`: `CLAIMED`, `CONFIRMED`, `REJECTED`, `USED`, `ORPHAN`, `EXPIRED`.
- `created_at`, `updated_at`.

Restricao critica:

- Unico por `tenant_id + provider + external_transaction_id`.

### payment_claims

Alegacoes vindas do WhatsApp. Nao confirmam pagamento sozinhas.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `payment_id`.
- `whatsapp_instance_id`.
- `context_key`.
- `chat_type`.
- `chat_id`.
- `user_id`.
- `message_id`.
- `raw_message_text`.
- `claimed_at`.
- `status`: `PENDING`, `MATCHED`, `REJECTED`, `EXPIRED`.
- `created_at`, `updated_at`.

Restricao:

- Unico por `tenant_id + whatsapp_instance_id + message_id`.

### payment_confirmations

Confirmacoes reais reportadas por SMS do dispositivo autorizado.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `payment_id`.
- `device_id`.
- `external_transaction_id`.
- `raw_sms`.
- `reported_at`.
- `parser_version`.
- `status`: `ORPHAN`, `MATCHED`, `REJECTED`, `EXPIRED`.
- `created_at`, `updated_at`.

Restricao:

- Unico por `tenant_id + device_id + external_transaction_id` quando o id externo existir.

### ussd_commands

Comandos de entrega executados pelo Tasker/MacroDroid.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `order_id`.
- `payment_id`.
- `device_id`.
- `destination_number`.
- `amount`.
- `status`: `PENDING`, `DISPATCHED`, `COMPLETED`, `FAILED`, `EXPIRED`, `CANCELLED`.
- `attempt_count`.
- `last_error`.
- `created_at`, `dispatched_at`, `acknowledged_at`, `updated_at`.

Restricoes:

- Um pagamento confirmado nao deve gerar duas entregas ativas para o mesmo pedido.
- ACK deve ser idempotente e auditado.

### audit_events

Log append-only de eventos relevantes.

Campos principais:

- `id` UUID.
- `tenant_id`.
- `actor_type`: `SYSTEM`, `USER`, `DEVICE`, `CUSTOMER`.
- `actor_id`.
- `event_type`.
- `resource_type`.
- `resource_id`.
- `metadata` JSONB.
- `occurred_at`.

## Estados Criticos

Pagamento:

```text
CLAIMED -> CONFIRMED -> USED
CLAIMED -> REJECTED
CLAIMED -> EXPIRED
ORPHAN -> CONFIRMED -> USED
ORPHAN -> EXPIRED
```

Pedido:

```text
PENDING_PAYMENT -> PAYMENT_VERIFIED -> PROCESSING_USSD -> COMPLETED
PENDING_PAYMENT -> EXPIRED
PAYMENT_VERIFIED -> FAILED
PROCESSING_USSD -> FAILED
```

USSD:

```text
PENDING -> DISPATCHED -> COMPLETED
PENDING -> DISPATCHED -> FAILED
PENDING -> EXPIRED
DISPATCHED -> EXPIRED
```

## Regras De Dominio

- Texto de WhatsApp nunca confirma pagamento sozinho.
- Confirmacao real deve vir de dispositivo autorizado para o mesmo tenant.
- Para venda de megas, o pagamento valido deve ser `RECEIVED`; outros tipos ficam registados, mas nao devem liberar USSD automaticamente.
- Valor confirmado deve bater com o valor reclamado/esperado.
- `external_transaction_id` usado com sucesso nao pode ser reutilizado.
- Comando USSD so pode ser criado para pagamento confirmado e pedido elegivel.
- Falha de USSD nao apaga pagamento; deve deixar pedido em estado operacionalmente investigavel.

## Proxima Implementacao Recomendada

Criar o esqueleto Spring Boot com PostgreSQL e migrations para estas entidades minimas, depois implementar primeiro:

1. Resolver tenant por instancia WhatsApp.
2. Registar alegacao de pagamento.
3. Registar confirmacao SMS.
4. Persistir idempotencia por `tenantId + provider + externalTransactionId`.
5. Devolver ao Node uma decisao simples: pendente, verificado, rejeitado ou orfa aceite.
