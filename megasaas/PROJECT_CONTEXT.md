# PROJECT_CONTEXT.md — Megas SaaS (WhatsApp + M-Pesa)

> **COMO USAR ESTE FICHEIRO**
> Cole o conteúdo inteiro deste ficheiro no início de qualquer nova conversa com a IA
> (mesmo que seja um novo chat, sem histórico). Ele contém tudo o que a IA precisa saber
> para continuar o projeto do ponto exato onde parou — sem gastar tokens a re-explicar
> arquitetura, decisões já tomadas, ou contratos de dados.
>
> Depois de colar este ficheiro, diga apenas: **"Continua na FASE X"** (ver estado em
> ROADMAP.md).

---

## 1. VISÃO DO PRODUTO

SaaS B2B multi-tenant que permite a revendedores venderem pacotes de internet ("megas")
via WhatsApp, com pagamento por M-Pesa. O pagamento **nunca** é confiado via mensagem do
WhatsApp — é validado por leitura real do SMS do M-Pesa através de um dispositivo Android
com Tasker, que reporta ao backend via HTTP. Após validação, o backend ordena ao Tasker
que execute o USSD de transferência de megas (`*111#` ou equivalente).

## 2. ARQUITETURA (decisão fixa — não renegociar sem motivo forte)

```
[Cliente WhatsApp] → [Node.js WhatsApp Layer] → [EventBus] → [BullMQ/Redis] → [Spring Boot Core]
                                                                                      │
[Tasker Android] ←──── HTTP commands (USSD) ←──── [Spring Boot Core] ←── valida SMS ──┘
                              │
                         POST /tasker/sms (transactionId, amount, rawSms, timestamp)
```

- **Multi-tenancy**: isolamento lógico por `tenantId` em todas as camadas (DB, filas, eventos).
- **Event-driven**: Node.js e Spring Boot não se chamam diretamente — comunicam via
  eventos/filas (Redis + BullMQ). Isto permite escalar cada camada de forma independente.
- **Node.js** = camada de mensageria (WhatsApp). Não contém regras de negócio de pagamento.
- **Spring Boot** = core de negócio (validação de pagamento, billing, multi-tenancy, admin).
- **Tasker** = única fonte de verdade para confirmação de pagamento e execução de USSD.
  O backend NUNCA confia em texto vindo do WhatsApp para liberar megas.

### Context Key (obrigatório em todo o sistema)
```
PRIVATE: chatId
GROUP:   groupId::userId
```
Isto identifica de forma única uma "sessão de conversa" mesmo dentro de grupos, onde
vários utilizadores podem estar a comprar ao mesmo tempo.

### Multi-dispositivo / Multi-tenant WhatsApp (decisão adiada — confirmado)
Hoje (Fase 1-2) o sistema liga **apenas um número de WhatsApp por vez**
(`BaileysProvider` único, instanciado uma vez em `src/index.js`). O utilizador confirmou
explicitamente manter o roteiro original: a capacidade de ligar múltiplos dispositivos
(um por tenant/revendedor, ou pool partilhado) só será resolvida na **Fase 8 —
Multi-tenancy**, depois de o modelo de billing estar definido. Não implementar isto
antes da Fase 8 sem pedido explícito.

### Terminologia (para não confundir fases)
- **"Cliente" do SaaS** = o revendedor que paga para usar a plataforma → isolamento entre
  revendedores é **Fase 8**.
- **"Clientes dele"** = os números de telefone que compram megas a UM revendedor → gerir
  vários números/transações pendentes em simultâneo, dentro de um único revendedor, é
  **Fase 4** (SessionManager/PendingTransactionManager) — NÃO depende da Fase 8.

### Fluxo de resposta automática ao cliente (requisito confirmado pelo utilizador)
Quando um cliente final copia e envia o texto de confirmação M-Pesa no WhatsApp, o bot
deve:
1. Cruzar essa mensagem com o SMS real reportado pelo Tasker (fonte única de verdade —
   Fase 5). A mensagem do WhatsApp NUNCA é suficiente sozinha para confirmar pagamento.
2. Se encontrar a transação correspondente → responder "a processar o pedido" →
   acionar USSD via Tasker → responder "megas já transferidos" após confirmação.
3. Se NÃO encontrar → responder de forma técnica que o pedido não foi recebido, que o
   cliente deve aguardar um pouco, e que pode contactar o suporte se demorar.
- Decisão em aberto para a Fase 4/5: no caso "não encontrada", decidir se há uma
  tentativa automática de nova verificação (esperar alguns segundos, pois pode ser
  apenas atraso do Tasker a reportar) antes de responder definitivamente que não foi
  encontrada.
- Mecanismo de envio (`sendText`) já existe desde a Fase 1 (`WhatsAppProvider`) — só
  falta a lógica de decisão (Fase 4) e os dados reais para decidir (Fase 5).

## 3. CONTRATO Tasker ↔ Backend (fixo desde a Fase 1, usado por todas as fases seguintes)

**Tasker → Backend** (`POST /api/v1/tasker/sms`)
```json
{
  "transactionId": "string (único, do SMS do M-Pesa)",
  "amount": "number",
  "rawSms": "string (corpo integral do SMS)",
  "timestamp": "ISO-8601 string"
}
```

**Backend → Tasker** (resposta)
```json
{ "status": "ACCEPTED" }
```
ou
```json
{ "status": "REJECTED", "reason": "DUPLICATE_TRANSACTION | INVALID_AMOUNT | INVALID_SIGNATURE | ..." }
```

## 4. SEGURANÇA (não negociável em nenhuma fase)
- Idempotência obrigatória por `transactionId` (chave única em DB).
- Anti-replay: timestamp com janela de tolerância + assinatura/token do dispositivo Tasker.
- Rate limiting por tenant e por dispositivo Tasker.
- Validação de origem: cada dispositivo Tasker tem uma credencial própria (não é aberto ao público).

## 5. FASES (roteiro fixo — ver estado atual em ROADMAP.md)

| Fase | Conteúdo | Camada |
|---|---|---|
| 1 | WhatsApp Provider + eventos base | Node.js |
| 2 | Parser M-Pesa robusto | Node.js |
| 3 | DTOs/modelos: Transaction, PaymentVerification, TenantContext, ParserResult | Node.js + Java |
| 4 | SessionManager + PendingTransactionManager | Node.js |
| 5 | Integração Tasker (SMS in / USSD out) | Node.js + Spring Boot |
| 6 | Integração Spring Boot (core de negócio) | Java |
| 7 | Redis + BullMQ (filas entre camadas) | Node.js + Java |
| 8 | Multi-tenancy, billing, painel admin | Java + Frontend |

**Regra de ouro**: cada fase entrega código que **compila e corre isoladamente**, com
contratos (interfaces/DTOs) estáveis, para que a fase seguinte nunca exija reescrever a anterior.

## 6. DECISÕES JÁ TOMADAS (não repetir a discussão)
- WhatsApp: **Baileys** (multi-device, sem Chromium/Puppeteer — mais leve para produção
  e escalável horizontalmente) em vez de whatsapp-web.js.
- Comunicação interna Node.js: `EventEmitter` local na Fase 1 (trocado por BullMQ na Fase 7)
  — a interface pública do EventBus já é desenhada para não mudar quando isso acontecer.
- Linguagem dos comentários/commits: português (PT-MZ), nomes de variáveis em inglês (padrão da indústria).
- Multi-dispositivo/multi-tenant WhatsApp: adiado para a Fase 8 (ver secção 2 acima).
- Parser M-Pesa: baseado em padrões de regex por tipo de SMS (estratégia extensível —
  novos tipos entram como novo módulo em `src/mpesa/patterns/`, sem tocar nos existentes).
  Formatos de SMS reais confirmados pelo utilizador: `Recebeste` (pagamento de cliente,
  sem taxa) e `Transferiste` (repasse, sempre com taxa, mesmo que 0.00MT). Ambos podem ter
  o campo de saldo ausente na SMS (edge case real observado) e um número de telemóvel
  moçambicano extra colado no fim (fora do texto oficial da SMS) — que representa o
  número de destino para onde os megas devem ser entregues, distinto do número que pagou.
- DTOs (Fase 3): `TransactionType`, `PaymentProvider`, `ParserResult`, `Transaction`,
  `PaymentVerification`, `TenantContext` vivem em `src/core/dto/` — provider-agnóstico,
  reutilizável quando o e-Mola chegar. `Transaction.source` (`WHATSAPP_TEXT` |
  `TASKER_SMS`) é o campo que impede, por construção, que código futuro confunda texto
  de WhatsApp com SMS real validada.
- Tasker (Fase 5): faz **polling** em `GET /commands/next` — o backend nunca contacta o
  Tasker diretamente (dispositivo Android sem IP público estável). Autenticação por
  Bearer token partilhado (`TASKER_API_KEY`). Handlers HTTP escritos como funções puras
  (`src/tasker/taskerHandlers.js`), sem depender de Express — mesmo padrão *ports &
  adapters* das fases anteriores, aplicado ao transporte HTTP.

## 7. Referência competitiva — "SPIDER BOT" (análise, nada implementado ainda)
O utilizador partilhou capturas de ecrã de um bot concorrente já em produção
("SPIDER BOT FENIAS"), pedindo análise de viabilidade e registo para decisão futura —
**nada disto está a ser construído agora**, é só backlog informado.

### O que o SPIDER BOT faz
- Interface por comandos com prefixo `.` (`.tabela`, `.pagar`, `.fechar`, `.abrir`).
- `.tabela` mostra pacotes/preços de megas configurados pelo revendedor.
- `.pagar` mostra os números de pagamento configurados (M-Pesa **e E-Mola** lado a
  lado) e pede o comprovativo.
- Moderação de grupo: bloqueia links suspeitos e mensagens de concorrentes, deteta
  palavras proibidas e pune automaticamente, protege contra clientes com WhatsApp
  modificado (GB WhatsApp etc.), abre/fecha grupo por comando.
- "Antipagamento de mensagens (exclusivo)" — provavelmente proteção contra reenvio do
  mesmo comprovativo para tentar receber megas duas vezes.
- O próprio bot é alugado ao revendedor por subscrição: 3 dias=15MT, 7 dias=30MT,
  30 dias=120MT.

### Análise de viabilidade (mapeado às fases já planeadas)
- **"Antipagamento" (reenvio do mesmo comprovativo)**: **já coberto**, e de forma mais
  robusta — a idempotência por `transactionId` construída na Fase 4
  (`PendingTransactionManager`, rejeição `ALREADY_USED`) resolve isto sem depender de
  heurísticas de texto, porque cruza com a SMS real (Fase 5), não só com o texto do
  WhatsApp.
- **E-Mola lado a lado com M-Pesa**: confirma que a decisão já tomada (`PaymentProvider`
  com `MPESA`/`EMOLA`, Fase 3) está no caminho certo — só falta construir o
  `EmolaParser` (extensão natural do padrão de `patterns/`, Fase 2) quando for prioridade.
- **Interface por comandos (`.tabela`, `.pagar`, etc.)**: funcionalidade nova, ainda não
  coberta por nenhuma fase. Tecnicamente simples com Baileys (é só reconhecer prefixo
  `.` no texto e rotear). Precisa de um conceito novo — "pacotes/preços por revendedor"
  — que só faz sentido a partir da Fase 8 (Multi-tenancy), quando cada revendedor tiver
  a sua própria configuração. Candidato natural: uma fase adicional entre a Fase 6 e a
  Fase 8, ou incorporada na própria Fase 8.
- **Moderação de grupo** (bloquear links/concorrentes, palavras proibidas, deteção de
  WhatsApp modificado, abrir/fechar grupo): tecnicamente viável com a API de admin de
  grupos do Baileys. É um domínio diferente do fluxo de pagamento — não bloqueia nada
  do que já está construído. Fica registado como possível "Fase 9" ou módulo opcional,
  a decidir prioridade mais tarde.
- **Modelo de subscrição do próprio bot** (3/7/30 dias): é o modelo de negócio da Fase 8
  (billing) — os valores do concorrente (15/30/120MT) servem de referência de mercado,
  mas a decisão de preço fica para essa altura.

## 8. ESTADO ATUAL
Ver `ROADMAP.md` neste mesmo pacote — é o ficheiro que se atualiza a cada fase concluída.
