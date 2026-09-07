import { PaymentVerification, PaymentVerificationReason } from '../dto/PaymentVerification.js';
import { Transaction, TransactionSource } from '../dto/Transaction.js';
import { TransactionEvents } from './TransactionEvents.js';

// Prazo para uma ALEGAÇÃO (WhatsApp) sem SMS real correspondente. O Tasker
// reporta de forma automática — 30s já é generoso para essa via.
const DEFAULT_CLAIM_TIMEOUT_MS = 30_000;

// Prazo para uma SMS REAL órfã sem alegação (WhatsApp) correspondente.
// Correção real (utilizador testou e confirmou): usar o mesmo prazo curto
// aqui era um erro — este lado espera por uma PESSOA (desbloquear o
// telemóvel, copiar, colar), não por um sistema automático. 15 minutos é
// um valor bem mais realista para tempo de reação humana.
//
// NOTA IMPORTANTE: aumentar este número não resolve tudo sozinho — o
// armazenamento continua em memória (Map), por isso reiniciar o processo
// perde os dados na mesma, independentemente do timeout configurado. A
// solução definitiva (sobreviver a reinícios, valer horas/dias com
// segurança) é a persistência da Fase 7 (Redis). Este valor é só o
// "melhor possível dentro do que a memória permite", não uma garantia.
const DEFAULT_ORPHAN_TIMEOUT_MS = 15 * 60_000;

/**
 * PendingTransactionManager
 * ----------------------------
 * Gere o cruzamento entre alegações de pagamento (WhatsApp) e transações
 * reais (Tasker) — em QUALQUER ordem de chegada:
 *
 *   Ordem A (assumida originalmente): WhatsApp primeiro, SMS depois.
 *   Ordem B (comum na realidade): SMS chega ao telemóvel do revendedor
 *     quase instantaneamente; o cliente só escreve a mensagem no WhatsApp
 *     alguns segundos/minutos depois.
 *
 * Em ambos os casos, o lado que chega primeiro fica guardado (alegação
 * pendente, ou transação real "órfã") à espera do outro lado — mas com
 * prazos DIFERENTES (ver constantes acima), porque a natureza da espera é
 * diferente: um lado é automático, o outro depende de uma pessoa.
 *
 * Idempotência: um transactionId que já foi confirmado com sucesso antes é
 * rejeitado imediatamente, nos dois sentidos.
 */
export class PendingTransactionManager {
  #store;
  #eventBus;
  #logger;
  #claimTimeoutMs;
  #orphanTimeoutMs;
  #corePaymentClient;

  constructor({
    store,
    eventBus,
    logger,
    claimTimeoutMs = DEFAULT_CLAIM_TIMEOUT_MS,
    orphanTimeoutMs = DEFAULT_ORPHAN_TIMEOUT_MS,
    corePaymentClient = null,
  }) {
    this.#store = store;
    this.#eventBus = eventBus;
    this.#logger = logger;
    this.#claimTimeoutMs = claimTimeoutMs;
    this.#orphanTimeoutMs = orphanTimeoutMs;
    this.#corePaymentClient = corePaymentClient;
  }

  /**
   * Regista uma alegação de pagamento vinda do WhatsApp.
   *
   * @param {import('../dto/Transaction.js').Transaction} transaction - deve
   *   ter source=WHATSAPP_TEXT.
   * @param {object} params
   * @param {string} params.contextKey
   * @returns {Promise<import('../dto/PaymentVerification.js').PaymentVerification|null>}
   *   `null` se ficou pendente, à espera da SMS real.
   *   `PaymentVerification` VERIFICADO se já havia uma SMS real órfã à
   *   espera desta alegação (ordem B).
   *   `PaymentVerification` REJEITADO se pôde ser recusada de imediato.
   */
  async registerClaim(transaction, options) {
    if (this.#corePaymentClient) {
      return this.#registerClaimInCore(transaction, options);
    }

    const { contextKey } = options;
    if (!transaction.externalTransactionId) {
      return PaymentVerification.rejected(PaymentVerificationReason.NOT_FOUND, {
        claimedTransactionId: null,
      });
    }

    const id = transaction.externalTransactionId;

    const alreadyUsed = await this.#store.isUsed(id);
    if (alreadyUsed) {
      this.#logger?.warn({ contextKey, transactionId: id }, '[PendingTransactionManager] transactionId já usado — rejeitado');
      return PaymentVerification.rejected(PaymentVerificationReason.ALREADY_USED, {
        claimedTransactionId: id,
      });
    }

    // Ordem B: já existe uma SMS real órfã à espera desta alegação —
    // cruza-se imediatamente, sem precisar de esperar pelo checkExpired().
    const orphan = await this.#store.getOrphanReal(id);
    if (orphan) {
      await this.#store.deleteOrphanReal(id);
      return this.#finalizeMatch({
        realTransaction: orphan.transaction,
        claimTransaction: transaction,
      });
    }

    await this.#store.set(id, { transaction, contextKey, registeredAt: Date.now() });
    this.#eventBus?.emit(TransactionEvents.CLAIM_REGISTERED, { transaction, contextKey });
    return null;
  }

  /**
   * Chamado quando uma transação REAL (source=TASKER_SMS) é reportada.
   * Cruza pelo `externalTransactionId`.
   *
   * @param {import('../dto/Transaction.js').Transaction} realTransaction
   * @returns {Promise<import('../dto/PaymentVerification.js').PaymentVerification|null>}
   *   `null` se não havia alegação pendente — a transação real fica
   *   guardada como órfã, à espera de uma alegação futura (ordem B).
   */
  async resolveWithRealTransaction(realTransaction, options = {}) {
    if (this.#corePaymentClient) {
      return this.#resolveWithRealTransactionInCore(realTransaction, options);
    }

    const id = realTransaction.externalTransactionId;
    const pending = id ? await this.#store.get(id) : null;

    if (!pending) {
      // Ordem B: guarda-se a transação real, em vez de a descartar —
      // correção do comportamento original (Fase 5), que perdia esta SMS
      // para sempre se a mensagem do WhatsApp ainda não tivesse chegado.
      if (id) {
        await this.#store.setOrphanReal(id, { transaction: realTransaction, registeredAt: Date.now() });
        this.#logger?.info({ transactionId: id }, '[PendingTransactionManager] transação real sem alegação — guardada como órfã');
      }
      return null;
    }

    await this.#store.delete(id);
    const verification = await this.#finalizeMatch({
      realTransaction,
      claimTransaction: pending.transaction,
    });

    // Este é o ÚNICO caminho que emite CLAIM_VERIFIED: quem chama
    // resolveWithRealTransaction (o servidor Tasker, Fase 5) não tem
    // acesso direto ao coordinator — o evento é a única forma de o
    // notificar. O caminho por registerClaim() (ordem invertida) já lida
    // com o resultado diretamente pelo valor devolvido, sem precisar do
    // evento — ver #finalizeMatch para o porquê desta distinção.
    this.#eventBus?.emit(TransactionEvents.CLAIM_VERIFIED, { verification, contextKey: pending.contextKey });
    return verification;
  }

  /**
   * Ponto único de decisão do cruzamento — usado nos dois sentidos (Ordem
   * A e Ordem B), garantindo exatamente a mesma lógica (validação de
   * valor, herança de destinationNumber, idempotência) independentemente
   * de qual lado chegou primeiro.
   *
   * IMPORTANTE: NÃO emite CLAIM_VERIFIED — quem decide se precisa do
   * evento é cada chamador (ver registerClaim/resolveWithRealTransaction).
   * Correção de um bug real: emitir sempre aqui fazia o coordinator reagir
   * DUAS VEZES à mesma confirmação quando o cruzamento acontecia dentro de
   * registerClaim() (ordem invertida) — uma vez pelo valor devolvido
   * (síncrono, imediato), outra vez pelo evento (assíncrono) — com risco
   * de transições de estado em corrida uma com a outra.
   */
  async #finalizeMatch({ realTransaction, claimTransaction, contextKey }) {
    const id = realTransaction.externalTransactionId;

    if (realTransaction.amount !== claimTransaction.amount) {
      return PaymentVerification.rejected(PaymentVerificationReason.AMOUNT_MISMATCH, {
        claimedTransactionId: id,
      });
    }

    await this.#store.markUsed(id);

    // O destino dos megas vem da alegação original do cliente (texto do
    // WhatsApp), nunca da SMS do operador — com fallback para o número que
    // pagou, se o cliente não indicou destino.
    realTransaction.destinationNumber = claimTransaction.destinationNumber ?? realTransaction.counterpartyPhone;

    return PaymentVerification.verified(realTransaction, { claimedTransactionId: id });
  }

  /**
   * Varredura periódica: expira alegações pendentes E transações órfãs há
   * mais tempo que o timeout configurado. Deve ser chamada periodicamente
   * (ver src/index.js) — a Fase 7 substitui por um job atrasado no BullMQ.
   *
   * @returns {Promise<Array<import('../dto/PaymentVerification.js').PaymentVerification>>}
   */
  async checkExpired() {
    const now = Date.now();
    const expired = [];

    for (const entry of await this.#store.listPending()) {
      if (now - entry.registeredAt < this.#claimTimeoutMs) continue;

      const id = entry.transaction.externalTransactionId;
      await this.#store.delete(id);

      const verification = PaymentVerification.rejected(PaymentVerificationReason.NOT_FOUND, {
        claimedTransactionId: id,
      });
      this.#logger?.warn({ contextKey: entry.contextKey, transactionId: id }, '[PendingTransactionManager] alegação expirou sem confirmação');
      this.#eventBus?.emit(TransactionEvents.CLAIM_EXPIRED, { verification, contextKey: entry.contextKey });
      expired.push(verification);
    }

    for (const entry of await this.#store.listOrphanReal()) {
      if (now - entry.registeredAt < this.#orphanTimeoutMs) continue;

      await this.#store.deleteOrphanReal(entry.externalTransactionId);
      // Nível 'error', não 'warn': isto é dinheiro real que o revendedor
      // recebeu e que nunca chegou a ser entregue como megas — merece
      // destaque no log para investigação manual (candidato a alerta
      // automático no painel admin da Fase 8).
      this.#logger?.error(
        {
          transactionId: entry.externalTransactionId,
          amount: entry.transaction.amount,
          counterpartyPhone: entry.transaction.counterpartyPhone,
        },
        '[PendingTransactionManager] SMS real órfã expirou sem alegação — pagamento recebido mas nunca reclamado no WhatsApp'
      );
      // Sem contextKey conhecido — não há a quem notificar, só limpamos memória.
    }

    return expired;
  }

  async #registerClaimInCore(transaction, options) {
    const decision = await this.#corePaymentClient.registerPaymentClaim({
      transaction,
      ...options,
    });
    return this.#toPaymentVerification(decision, transaction);
  }

  async #resolveWithRealTransactionInCore(realTransaction, options) {
    const decision = await this.#corePaymentClient.registerSmsConfirmation({
      transaction: realTransaction,
      ...options,
    });

    const verification = this.#toPaymentVerification(decision, realTransaction);
    if (!verification) {
      return null;
    }

    if (verification.verified) {
      if (!decision.contextKey) {
        this.#logger?.error(
          { transactionId: realTransaction.externalTransactionId },
          '[PendingTransactionManager] Core confirmou pagamento sem contextKey; fluxo WhatsApp nao pode avancar'
        );
        return verification;
      }

      this.#eventBus?.emit(TransactionEvents.CLAIM_VERIFIED, {
        verification,
        contextKey: decision.contextKey,
      });
    }

    return verification;
  }

  #toPaymentVerification(decision, originalTransaction) {
    if (!decision || decision.decision === 'PENDING_VERIFICATION' || decision.decision === 'ORPHAN_CONFIRMATION_ACCEPTED') {
      return null;
    }

    const transactionId = decision.externalTransactionId ?? originalTransaction.externalTransactionId;

    if (decision.decision === 'VERIFIED') {
      return PaymentVerification.verified(
        new Transaction({
          tenantId: decision.tenantId ?? originalTransaction.tenantId,
          provider: originalTransaction.provider,
          type: originalTransaction.type,
          externalTransactionId: transactionId,
          amount: Number(decision.amount ?? originalTransaction.amount),
          deliveryAmount: decision.deliveryAmount != null ? Number(decision.deliveryAmount) : originalTransaction.deliveryAmount,
          fee: originalTransaction.fee,
          counterpartyPhone: originalTransaction.counterpartyPhone,
          counterpartyName: originalTransaction.counterpartyName,
          destinationNumber: decision.destinationNumber ?? originalTransaction.destinationNumber,
          balanceAfter: originalTransaction.balanceAfter,
          occurredAt: originalTransaction.occurredAt,
          source: TransactionSource.TASKER_SMS,
        }),
        { claimedTransactionId: transactionId }
      );
    }

    return PaymentVerification.rejected(decision.reason ?? PaymentVerificationReason.NOT_FOUND, {
      claimedTransactionId: transactionId,
    });
  }
}
