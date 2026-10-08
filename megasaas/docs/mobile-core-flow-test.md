# Mobile Core Flow Test

Objetivo: testar no telemovel que um pagamento de `15.00MT` gera comando USSD com `600`, vindo do Spring Core e nao do `PACKAGE_PRICE_TABLE` do Node.

## 1. Preparar PostgreSQL local

Cria a base de dados local `megasaas` e o utilizador `megasaas` conforme o teu ambiente PostgreSQL.

## 2. Arrancar o Spring Core

No Terminal A:

```powershell
cd "C:\Users\Asus\Downloads\megasaas-fase1-5 (4)\megasaas\core"
$env:CORE_INTERNAL_API_TOKEN="test-token"
$env:DATABASE_URL="jdbc:postgresql://localhost:5432/megasaas"
$env:DATABASE_USERNAME="megasaas"
$env:DATABASE_PASSWORD="megasaas"
.\mvnw.cmd spring-boot:run
```

O arranque do Core executa as migrations Flyway e cria as tabelas.

Confirmar health noutro terminal:

```powershell
Invoke-WebRequest -Uri http://localhost:8080/actuator/health -UseBasicParsing
```

## 3. Aplicar seed local

No Terminal B:

```powershell
cd "C:\Users\Asus\Downloads\megasaas-fase1-5 (4)\megasaas\core"
psql "postgresql://megasaas:megasaas@localhost:5432/megasaas" -f src\main\resources\db\seed\local-dev.sql
```

## 4. Configurar o Node para usar o Core

No `.env` do Node, usa:

```env
CORE_API_BASE_URL=http://localhost:8080
CORE_INTERNAL_API_TOKEN=test-token
CORE_TENANT_ID=11111111-1111-1111-1111-111111111111
TASKER_DEVICE_ID=22222222-2222-2222-2222-222222222222
WHATSAPP_INSTANCE_ID=default-instance
TASKER_API_KEY=meu_segredo
TASKER_PORT=3001
PACKAGE_PRICE_TABLE=
```

`PACKAGE_PRICE_TABLE=` vazio e importante neste teste: se o MacroDroid receber `600`, esse valor veio do Core.

Arranca o Node:

```powershell
cd "C:\Users\Asus\Downloads\megasaas-fase1-5 (4)\megasaas"
npm.cmd start
```

No log deve aparecer:

```text
[main] pagamentos delegados ao Spring Core
```

Nao deve aparecer:

```text
[main] tabela temporaria de pacotes carregada de PACKAGE_PRICE_TABLE
```

## 5. Configurar MacroDroid

Mantem os mesmos endpoints do Node, usando o IP do PC na rede local:

```text
GET  http://<IP_DO_PC>:3001/api/v1/tasker/commands/next
POST http://<IP_DO_PC>:3001/api/v1/tasker/commands/{lv=lv_command_id}/ack?success=true
POST http://<IP_DO_PC>:3001/api/v1/tasker/sms
```

Todos os requests MacroDroid devem enviar:

```text
Authorization: Bearer meu_segredo
```

O `GET /commands/next` deve extrair:

- `commandId` para `lv_command_id`.
- `destinationNumber` para `lv_numero_destino`.
- `amount` para `lv_valor_enviar`.

Neste teste, quando o pagamento for `15.00MT`, `lv_valor_enviar` deve ficar `600`.

## 6. Executar o teste

1. No WhatsApp, envia o comprovativo do cliente com `15.00MT` e numero de destino.
2. O Node envia a claim ao Core.
3. Quando a SMS real `Recebeste 15.00MT` entrar e o MacroDroid fizer `POST /sms`, o Core confirma o pagamento.
4. O Node cria comando USSD.
5. No MacroDroid, `GET /commands/next` deve responder `200` com:

```json
{
  "paymentAmount": 15,
  "deliveryAmount": 600,
  "amount": 600
}
```

Resultado esperado no telemovel:

- O MacroDroid deve digitar `600` no menu USSD, nao `15`.
- Depois do ACK ou da SMS `Transferiste`, o Node deve enviar a resposta final no WhatsApp.

## 7. Se falhar

- Se `GET /commands/next` devolve `204`, ainda nao ha comando ou o pagamento nao foi verificado.
- Se o Node mostrar erro HTTP do Core, confirma `CORE_INTERNAL_API_TOKEN`, `CORE_API_BASE_URL` e se o Spring esta ligado.
- Se `deliveryAmount` vier `null`, confirma se o seed foi aplicado e se existe preco ativo `15.00 -> 600MB`.
- Se o MacroDroid digitar `15`, confirma que `PACKAGE_PRICE_TABLE` esta vazio e que o Node arrancou depois dessa alteracao.
