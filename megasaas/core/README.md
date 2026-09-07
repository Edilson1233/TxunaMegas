# MegaSaaS Core

Spring Boot Core/System of Record do MegaSaaS.

## Estado

Este modulo e o primeiro incremento do core Java. Ele ainda nao substitui o fluxo Node.js existente. O objetivo inicial e criar a base persistente para tenants, dispositivos, pedidos, pagamentos, idempotencia e auditoria.

## Responsabilidades

- Persistir estado de dominio em PostgreSQL.
- Aplicar idempotencia duravel para pagamentos.
- Resolver tenant por instancia WhatsApp.
- Expor REST API interna autenticada para o gateway Node.js.
- Servir, no futuro, as APIs de dashboard/admin.

## Comandos

Requer Java 21 e Maven.

```powershell
mvn test
mvn spring-boot:run
```

Configuracao local esperada:

```powershell
$env:DATABASE_URL="jdbc:postgresql://localhost:5432/megasaas"
$env:DATABASE_USERNAME="megasaas"
$env:DATABASE_PASSWORD="megasaas"
$env:CORE_INTERNAL_API_TOKEN="trocar-em-producao"
```

## Endpoint Inicial

```http
GET /internal/v1/tenant-context/whatsapp-instances/{instanceId}
Authorization: Bearer <CORE_INTERNAL_API_TOKEN>
```

Resolve qual tenant e dono de uma instancia WhatsApp.

## Endpoints De Pagamento

```http
POST /internal/v1/payment-claims
Authorization: Bearer <CORE_INTERNAL_API_TOKEN>
Idempotency-Key: <chave-unica>
```

Regista uma alegacao de pagamento recebida via WhatsApp.

```http
POST /internal/v1/payment-confirmations/sms
Authorization: Bearer <CORE_INTERNAL_API_TOKEN>
Idempotency-Key: <chave-unica>
```

Regista uma SMS real reportada pelo dispositivo de automacao.

Decisoes possiveis:

- `PENDING_VERIFICATION`
- `VERIFIED`
- `REJECTED`
- `ORPHAN_CONFIRMATION_ACCEPTED`

Regras ja aplicadas no core:

- Texto de WhatsApp deve chegar como `WHATSAPP_TEXT`.
- SMS real deve chegar como `TASKER_SMS`.
- Apenas `RECEIVED` pode confirmar automaticamente pagamento para entrega.
- Valor, provider e `externalTransactionId` devem bater entre payload e parse.
- A resposta e persistida por `Idempotency-Key` para replay seguro da mesma operacao.
