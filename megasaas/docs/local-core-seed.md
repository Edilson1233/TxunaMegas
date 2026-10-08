# Local Core Seed

Este seed existe para testar o fluxo real `Node -> Spring Core -> deliveryAmount -> USSD` sem depender de `PACKAGE_PRICE_TABLE`.

O ficheiro nao e executado automaticamente pelo Flyway. Deve ser aplicado manualmente apenas em base de dados local:

```powershell
cd "C:\Users\Asus\Downloads\megasaas-fase1-5 (4)\megasaas\core"
psql "postgresql://megasaas:megasaas@localhost:5432/megasaas" -f src\main\resources\db\seed\local-dev.sql
```

Dados criados:

- Tenant: `11111111-1111-1111-1111-111111111111`.
- WhatsApp instance: `default-instance`.
- MacroDroid/Tasker device: `22222222-2222-2222-2222-222222222222`.
- Produto: `Mobile Data`.
- Pacote/preco: `15.00 MZN -> 600MB`.
- Pacote/preco: `30.00 MZN -> 1200MB`.

Variaveis esperadas no Node para usar estes dados:

```env
CORE_API_BASE_URL=http://localhost:8080
CORE_INTERNAL_API_TOKEN=test-token
CORE_TENANT_ID=11111111-1111-1111-1111-111111111111
TASKER_DEVICE_ID=22222222-2222-2222-2222-222222222222
WHATSAPP_INSTANCE_ID=default-instance
```

Nunca aplicar este seed numa base de producao.

Para o roteiro completo com Core, Node, MacroDroid e WhatsApp, ver `docs/mobile-core-flow-test.md`.
