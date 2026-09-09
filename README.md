# MegaSaaS

Sistema SaaS para venda automatizada de pacotes de internet, com fluxo via WhatsApp, leitura/validacao de pagamentos M-Pesa e integracao Android para SMS/USSD.

## Componentes

- `megasaas/`: gateway Node.js para WhatsApp/Baileys, parser M-Pesa, sessoes, Tasker/MacroDroid e integracoes.
- `megasaas/core/`: Core Spring Boot para tenants, pedidos, pagamentos, dispositivos, idempotencia e APIs internas.

## Requisitos

- Node.js 18+
- Java 21
- PostgreSQL, para executar o Core com persistencia real

## Configuracao

```powershell
cd megasaas
copy .env.example .env
npm install
```

Variaveis importantes no `.env`:

- `TASKER_API_KEY`
- `TASKER_PORT`
- `CORE_API_BASE_URL`
- `CORE_INTERNAL_API_TOKEN`
- `CORE_TENANT_ID`
- `TASKER_DEVICE_ID`

## Executar

Gateway Node.js:

```powershell
cd megasaas
npm start
```

Core Spring Boot:

```powershell
cd megasaas/core
.\mvnw.cmd spring-boot:run
```

## Testes

```powershell
cd megasaas
npm test
```

```powershell
cd megasaas/core
.\mvnw.cmd test
```

## Notas De Seguranca

- Nao liberar megas apenas com texto recebido no WhatsApp.
- Confirmar pagamentos com SMS real reportada por dispositivo autorizado.
- Manter idempotencia por tenant, provider, transacao externa e headers REST.
- Usar tokens fortes para Tasker/MacroDroid em producao.
