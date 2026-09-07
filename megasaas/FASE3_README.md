# FASE 3 — DTOs e Modelos de Dados (Node.js)

## Objetivo da fase
Formalizar `Transaction`, `PaymentVerification`, `TenantContext` e `ParserResult` como
classes próprias, para que todas as camadas do sistema (Node.js hoje, Spring Boot na
Fase 6) falem exatamente a mesma língua sobre o que significa "isto foi pago", "isto foi
verificado" e "isto pertence a este revendedor".

## Estrutura entregue
```
src/core/dto/
├── TransactionType.js       (enum: RECEIVED | TRANSFER_SENT | UNKNOWN — movido do mpesa)
├── PaymentProvider.js       (enum: MPESA | EMOLA)
├── ParserResult.js          (classe formal — antes era objeto literal na Fase 2)
├── Transaction.js           (+ TransactionSource, TransactionStatus)
├── PaymentVerification.js   (+ PaymentVerificationReason)
└── TenantContext.js         (resolveForInstance())

src/mpesa/MpesaMessageType.js   (agora só reexporta TransactionType do core)
src/mpesa/MpesaParser.js        (refatorado para devolver ParserResult formal)

test/dto.test.js                (7 testes novos, incluindo a cadeia completa)
```

## Decisões arquiteturais e porquê

**1. `Transaction.source` — a decisão mais importante desta fase**
Toda `Transaction` tem de declarar explicitamente de onde vieram os dados:
`WHATSAPP_TEXT` (texto colado pelo cliente — nunca confiável sozinho) ou `TASKER_SMS`
(SMS real lida pelo Tasker — única fonte de verdade). Isto não é decoração: torna a regra
de ouro do projeto ("nunca confiar em WhatsApp para liberar megas") **impossível de
esquecer por acidente** em código futuro. Quando, na Fase 5, alguém escrever a lógica que
aciona o USSD, vai ter de olhar para `transaction.source` — e se essa verificação faltar,
é um erro óbvio de apanhar em revisão de código, não um bug escondido numa condição solta.

**2. `ParserResult` como classe imutável, não objeto literal**
Na Fase 2, `MpesaParser.parse()` devolvia um objeto literal `{ matched, type, ... }`.
Agora devolve uma instância de `ParserResult`, construída através de duas factories:
`ParserResult.matched({...})` e `ParserResult.unknown({...})`. O shape dos dados **não
mudou nem um campo** — prova disso é que os 7 testes da Fase 2 continuam a passar sem
qualquer alteração. O que ganhámos: validação de tipos na construção (nunca se cria um
`ParserResult` com `matched` que não seja boolean, por exemplo) e imutabilidade
(`Object.freeze`) — um resultado de parsing já calculado não pode ser alterado por
engano por quem o consome.

**3. `TransactionType` mudou de casa, mas nada que o usava precisou de mudar**
Este enum (RECEIVED/TRANSFER_SENT/UNKNOWN) vivia em `src/mpesa/MpesaMessageType.js`,
mas é um conceito de negócio, não específico de M-Pesa — por isso mudou-se para
`src/core/dto/TransactionType.js`. Para não obrigar a tocar nos padrões (`patterns/`) nem
nos testes já escritos, `MpesaMessageType.js` ficou reduzido a uma linha que reexporta o
enum do core com o nome antigo. Isto é uma técnica deliberada: mover a "casa" de um
conceito sem quebrar quem já depende do caminho de importação antigo.

**4. `TenantContext.resolveForInstance()` já existe, mas devolve sempre o mesmo tenant**
Antes da Fase 8, há sempre e apenas um revendedor. Em vez de adiar completamente o
conceito de tenant, criámos já a interface (`resolveForInstance(instanceId)`) com uma
implementação "burra" (devolve sempre `DEFAULT_TENANT_ID`). Quando a Fase 8 chegar, só a
implementação interna muda (passa a consultar uma tabela real) — a assinatura do método,
e todo o código que já a usa (como `src/index.js`), fica igual.

**5. `PaymentVerification` mapeia diretamente o fluxo que acordámos**
Este DTO tem `verified: boolean` + (`transaction` se verdadeiro, ou `reason` se falso).
Corresponde exatamente ao nó de decisão "Cruza com SMS real" do fluxo de resposta ao
cliente que discutimos: `PaymentVerification.verified(transaction)` → responder "a
processar" → "megas transferidos"; `PaymentVerification.rejected(NOT_FOUND)` → responder
"pedido não encontrado, aguarde ou contacte suporte". A Fase 4/5 só precisa de construir
estas instâncias corretamente — a decisão de que resposta dar já está implícita no shape.

## Testes (14 no total — `npm test`)
Os 7 da Fase 2 continuam intactos. Os 7 novos da Fase 3 cobrem:
1. `TenantContext.resolveForInstance` devolve o tenant único esperado.
2. `Transaction.fromParserResult` constrói corretamente a partir de SMS real.
3. `Transaction.fromParserResult` rejeita um `ParserResult` não reconhecido.
4. `Transaction` rejeita provider/amount/source inválidos (defesa de tipo).
5. `PaymentVerification.verified` exige uma `Transaction` associada.
6. `PaymentVerification.rejected` exige um motivo.
7. **Cadeia completa**: SMS real → `MpesaParser` → `ParserResult` → `Transaction` →
   `PaymentVerification` confirmada — prova que todas as camadas encaixam.

## Riscos conhecidos
- Estes DTOs vivem só no lado Node.js por agora. Quando a Fase 6 (Spring Boot) chegar,
  vão precisar de equivalentes em Java com os MESMOS nomes de campos — isto é
  intencional (documentado desde o início do projeto), mas é trabalho que ainda não foi
  feito.
- `TenantContext` ainda não é persistido em lado nenhum (não há BD). Isso é esperado —
  só passa a fazer sentido a partir da Fase 6/8.

## Como testar localmente
```bash
npm test
```
Deves ver `# pass 14` e `# fail 0` no final.

## Como continuar para a Fase 4
Numa nova conversa (para poupar tokens), cola o conteúdo de `PROJECT_CONTEXT.md` e diz:
> "Continua na FASE 4 — SessionManager e PendingTransactionManager"
