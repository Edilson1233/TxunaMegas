# FASE 2 — Parser M-Pesa Robusto (Node.js)

## Objetivo da fase
Transformar o texto bruto de uma SMS M-Pesa (ou texto colado no WhatsApp contendo essa
SMS) em dados estruturados e fiáveis — valor, taxa, contraparte, saldo, data/hora e,
crucialmente, o número de destino dos megas quando este é diferente de quem pagou.

## Estrutura entregue
```
src/mpesa/
├── MpesaMessageType.js         (enum: RECEIVED | TRANSFER_SENT | UNKNOWN)
├── normalizeText.js            (normalização de espaços/encoding antes do parsing)
├── parseAmount.js               (texto monetário -> number)
├── parseMpesaDateTime.js        (data/hora MZ -> ISO 8601 UTC)
├── MpesaParser.js                (orquestrador — API pública)
└── patterns/
    ├── receivedPattern.js       ("Recebeste" — pagamento de cliente)
    └── transferSentPattern.js   ("Transferiste" — repasse do revendedor)

test/
└── mpesaParser.test.js          (7 testes, node:test — corre com `npm test`)
```

## Decisões arquiteturais e porquê

**1. Um módulo por tipo de SMS, registado numa lista ordenada**
Cada padrão (`receivedPattern`, `transferSentPattern`) só sabe reconhecer e extrair o SEU
próprio tipo de mensagem. O orquestrador (`MpesaParser`) testa cada um em sequência até
um "bater". Quando aparecer um terceiro formato real (ex: "pagamento a comerciante",
"levantamento"), cria-se um novo ficheiro em `patterns/` e adiciona-se uma linha à lista
— **nenhum código existente muda**. Isto é o que torna o parser extensível sem se tornar
frágil (o clássico problema de "uma regex gigante que ninguém mais entende").

**2. Nunca lança exceção — sempre devolve um resultado estruturado**
Mensagens de WhatsApp são, na sua maioria, conversa normal ("na boa", saudações, etc.),
não SMS M-Pesa. O parser trata isso como caso normal, não como erro: devolve
`{ matched: false, type: 'UNKNOWN', warnings: [...] }`. Isto é essencial porque este
parser vai ser chamado para **toda** mensagem recebida (Fase 4 em diante) — se lançasse
exceção em texto não reconhecido, um simples "obrigado" de um cliente derrubava o
processo.

**3. Tolerância a variações reais de formatação**
- Espaços duplicados, tabs, quebras de linha do Windows → normalizados antes do parsing.
- Vírgula como separador decimal (`210,50`) → aceite, convertido para ponto.
- Saldo ausente na SMS (`"O teu novo saldo M-Pesa e de . Continua..."`) → não falha,
  devolve `balance: null` e um warning explícito (`saldo_ausente_na_sms`), em vez de
  rejeitar a mensagem inteira. Isto é literalmente o caso real que reportaste.

**4. Extração do "número de destino" (a tua observação foi decisiva aqui)**
A lógica não tenta adivinhar esse número em qualquer parte do texto — só procura DEPOIS
da fronteira de fecho conhecida da SMS oficial (a partir de `"liga 100..."`). Isto evita
falsos positivos: por exemplo, o número de telefone da contraparte do pagamento (que
aparece ANTES dessa fronteira) nunca é confundido com o número de destino dos megas.

**5. Datas: fuso de Maputo fixado no código, não no sistema operativo**
M-Pesa MZ escreve sempre `30/6/26` (D/M/AA) e hora em 12h (`12:06 AM`). Convertemos para
ISO 8601 UTC assumindo sempre UTC+2 (Maputo, sem horário de verão) — fixo no código, não
dependente do fuso horário configurado na máquina onde o processo corre. Isto evita um
bug clássico: "funciona no meu portátil, dá timestamps errados no servidor" (que
tipicamente corre em UTC).

**6. Contrato de saída já é o definitivo (não vai mudar na Fase 3)**
O shape devolvido por `MpesaParser.parse()` — `matched`, `type`, `transactionId`,
`amount`, `fee`, `counterpartyPhone`, `counterpartyName`, `occurredAt`, `balance`,
`destinationNumber`, `warnings`, `raw`, `parserVersion` — é exatamente o que a Fase 3 vai
"embrulhar" na classe `ParserResult`. Não há retrabalho: só vai ganhar um nome formal.

## Testes (todos a passar — `npm test`)
1. SMS real "Recebeste" completa → todos os campos corretos.
2. SMS real "Transferiste" completa, com saldo presente.
3. **O teu caso real exato**: "Transferiste" com saldo ausente + número de destino
   anexado no fim → `balance: null`, `destinationNumber: '859253929'`, sem lançar erro.
4. Texto irrelevante ("na boa") → `matched: false`, sem lançar erro.
5. Texto vazio/nulo/indefinido → não lança erro.
6. Espaços duplicados e quebras de linha → ainda reconhece corretamente.
7. Vírgula como separador decimal → aceite corretamente.

## Riscos conhecidos
- **Só dois tipos de SMS cobertos.** Se o M-Pesa MZ tiver outros formatos reais em uso
  (compra de crédito, pagamento a comerciante, levantamento em agente), esses vão cair
  em `UNKNOWN` até termos exemplos reais para criar o padrão correspondente. **Ação para
  ti**: sempre que vires um formato novo de SMS M-Pesa em produção, copia o texto exato
  e trago um novo padrão rapidamente (é uma mudança pequena e isolada).
- **`destinationNumber` é uma heurística, não uma garantia.** Se um cliente colar texto
  extra depois da SMS que por acaso contenha um número no formato certo (mas sem ser o
  destino real dos megas), o parser vai capturá-lo na mesma. Isso é aceitável nesta fase
  (é só extração de dados, não é decisão de negócio) — a decisão de o que fazer com esse
  número (confirmar com o cliente? usar automaticamente?) é da Fase 4 (SessionManager).

## Como testar localmente
```bash
npm install   # se ainda não tiveres feito (baixa dotenv, pino, etc.)
npm test
```
Deves ver `# pass 7` e `# fail 0` no final.

## Como continuar para a Fase 3
Numa nova conversa (para poupar tokens), cola o conteúdo de `PROJECT_CONTEXT.md` e diz:
> "Continua na FASE 3 — DTOs e modelos de dados"
