# AGENTS.md

## Visao Geral
- `megasaas/` contem o servico Node.js, usado como Automation/Integration Gateway.
- `megasaas/core/` contem o Spring Boot Core/System of Record.
- PostgreSQL e a persistencia principal do Core. Redis/BullMQ fica reservado para filas/retries/jobs do lado Node.

## Responsabilidades
- Node.js: WhatsApp/Baileys, SMS/Tasker/MacroDroid, parsing tecnico, sessoes, dispositivos, USSD, workers e integracoes externas.
- Spring Boot: tenants, utilizadores, RBAC, clientes, produtos/pacotes, precos, pedidos, pagamentos, subscricoes, billing, auditoria e APIs admin/dashboard.
- Node pode delegar pagamentos ao Core por REST autenticado quando `CORE_API_BASE_URL` estiver configurado.

## Regras De Separacao
- Nao colocar regras centrais de dominio SaaS no Node quando pertencerem ao Core.
- Nao duplicar logica Node/Spring sem necessidade; escolher um dono e expor contrato.
- Node valida transporte, origem e formato tecnico. Spring decide estado persistente de pedidos/pagamentos.
- Verificar o estado real do repositorio antes de assumir que uma fase esta concluida.

## Comandos
- Node instalar: `cd megasaas` e `npm install`.
- Node executar: `npm start`.
- Node desenvolvimento: `npm run dev`.
- Node testar: `npm.cmd test` no Windows, ou `npm test`.
- Core testar: `cd megasaas/core` e `.\mvnw.cmd test` no Windows, ou `./mvnw test`.
- Core executar: `.\mvnw.cmd spring-boot:run` no Windows, ou `./mvnw spring-boot:run`.

## Convencoes
- Codigo e a fonte principal da verdade; docs antigas podem estar desatualizadas.
- Comentarios/docs em portugues; nomes de codigo em ingles.
- Mudancas devem ser pequenas, testaveis e alinhadas aos modulos existentes.
- Toda alteracao de comportamento precisa de teste automatizado.

## Seguranca
- Nunca confiar em texto de WhatsApp para liberar megas.
- Pagamento so avanca com SMS real reportada por dispositivo autorizado.
- Preservar idempotencia por tenant/provider/transacao externa e por headers REST.
- USSD exige autenticacao, autorizacao por dispositivo/tenant, ACK, timeout, retry e auditoria.
- Tokens Tasker/MacroDroid nao devem ser globais em producao.
