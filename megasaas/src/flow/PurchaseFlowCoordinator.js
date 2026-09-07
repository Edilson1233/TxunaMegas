import { WhatsAppEvents } from '../whatsapp/events/WhatsAppEvents.js';
import { TransactionEvents } from '../core/transactions/TransactionEvents.js';
import { UssdEvents } from '../tasker/UssdEvents.js';
import { MpesaParser } from '../mpesa/MpesaParser.js';
import { Transaction, TransactionSource } from '../core/dto/Transaction.js';
import { SessionState } from '../core/session/SessionState.js';
import { PaymentVerificationReason } from '../core/dto/PaymentVerification.js';
import { ContextKeyResolver } from '../core/context/ContextKeyResolver.js';
import { replyMessages } from './replyMessages.js';

// Mesmo formato usado pelo MpesaParser para números moçambicanos — aqui
// exige o texto INTEIRO (^...$), porque é a resposta completa do cliente a
// "qual é o número de destino", não um número embutido no meio de uma SMS.
const MZ_PHONE_EXACT_REGEX = /^8[2-7]\d{7}$/;

/**
 * PurchaseFlowCoordinator
 * --------------------------
 * O "maestro" que liga tudo o que já existe (parser M-Pesa, DTOs,
 * SessionManager, PendingTransactionManager, UssdCommandQueue) ao pipeline
 * de eventos do WhatsApp — incluindo as respostas reais ao cliente.
 */
export class PurchaseFlowCoordinator {
  #eventBus;
  #sessionManager;
  #pendingTransactionManager;
  #ussdCommandQueue;
  #tenantContext;
  #logger;
  #whatsAppProvider;
  #priceTable;
  // Alegações que já reconhecemos como SMS M-Pesa mas sem número de
  // destino indicado — à espera da resposta do cliente com esse número.
  // Vive só aqui (não no Session, que é agnóstico de WhatsApp) porque é
  // puramente um detalhe de orquestração desta camada.
  #pendingDestinationRequests = new Map();

  constructor({
    eventBus,
    sessionManager,
    pendingTransactionManager,
    ussdCommandQueue,
    tenantContext,
    logger,
    whatsAppProvider = null,
    priceTable = null,
  }) {
    this.#eventBus = eventBus;
    this.#sessionManager = sessionManager;
    this.#pendingTransactionManager = pendingTransactionManager;
    this.#ussdCommandQueue = ussdCommandQueue;
    this.#tenantContext = tenantContext;
    this.#logger = logger;
    this.#whatsAppProvider = whatsAppProvider;
    this.#priceTable = priceTable;
  }

  /** Regista os listeners no EventBus. Chamar uma vez, no arranque. */
  start() {
    this.#eventBus.on(WhatsAppEvents.MESSAGE_RECEIVED, (payload) => this.#onMessageReceived(payload));
    this.#eventBus.on(TransactionEvents.CLAIM_VERIFIED, (evt) => this.#onClaimVerified(evt));
    this.#eventBus.on(TransactionEvents.CLAIM_EXPIRED, (evt) => this.#onClaimExpired(evt));
    this.#eventBus.on(UssdEvents.COMPLETED, (evt) => this.#onUssdCompleted(evt));
    this.#eventBus.on(UssdEvents.FAILED, (evt) => this.#onUssdFailed(evt));
  }

  async #onMessageReceived({ contextKey, text, raw, chatType, chatId, userId, messageId, timestamp }) {
    if (!text) return;

    // Se já pedimos o número de destino a este contextKey, a próxima
    // mensagem dele é interpretada como resposta a esse pedido — não como
    // uma nova tentativa de reconhecer SMS M-Pesa.
    if (this.#pendingDestinationRequests.has(contextKey)) {
      await this.#onDestinationNumberReply(contextKey, text, raw);
      return;
    }

    const parsed = MpesaParser.parse(text);
    if (!parsed.matched) return;

    const transaction = Transaction.fromParserResult(parsed, {
      tenantContext: this.#tenantContext,
      source: TransactionSource.WHATSAPP_TEXT,
    });

    const currentSession = await this.#sessionManager.getOrCreate(contextKey);
    if (currentSession.state === SessionState.PROCESSING) {
      this.#logger.warn(
        { contextKey, transactionId: transaction.externalTransactionId, currentTransactionId: currentSession.currentTransactionId },
        '[PurchaseFlowCoordinator] nova alegaÃ§Ã£o ignorada porque jÃ¡ existe USSD em processamento'
      );
      await this.#reply(
        contextKey,
        replyMessages.stillProcessing({ transactionId: currentSession.currentTransactionId }),
        { quoted: raw }
      );
      return;
    }

    if (!transaction.destinationNumber) {
      this.#pendingDestinationRequests.set(contextKey, {
        transaction,
        metadata: { parsedPayment: parsed, chatType, chatId, userId, messageId, receivedAt: timestamp, rawMessageText: text },
      });
      const session = await this.#sessionManager.transition(contextKey, SessionState.AWAITING_DESTINATION_NUMBER, {
        currentTransactionId: transaction.externalTransactionId,
      });
      this.#logger.info(
        { contextKey, state: session.state, transactionId: transaction.externalTransactionId },
        '[PurchaseFlowCoordinator] a pedir número de destino ao cliente'
      );
      await this.#reply(
        contextKey,
        replyMessages.askForDestinationNumber({ transactionId: transaction.externalTransactionId }),
        { quoted: raw }
      );
      return;
    }

    await this.#registerAndAdvance(transaction, contextKey, raw, {
      parsedPayment: parsed,
      chatType,
      chatId,
      userId,
      messageId,
      receivedAt: timestamp,
      rawMessageText: text,
    });
  }

  async #onDestinationNumberReply(contextKey, text, raw) {
    const candidate = text.trim();

    if (!MZ_PHONE_EXACT_REGEX.test(candidate)) {
      await this.#sessionManager.transition(contextKey, SessionState.AWAITING_DESTINATION_NUMBER);
      await this.#reply(contextKey, replyMessages.invalidDestinationNumber(), { quoted: raw });
      return;
    }

    const pendingDestination = this.#pendingDestinationRequests.get(contextKey);
    this.#pendingDestinationRequests.delete(contextKey);
    const transaction = pendingDestination.transaction;
    transaction.destinationNumber = candidate;

    this.#logger.info(
      { contextKey, transactionId: transaction.externalTransactionId, destinationNumber: candidate },
      '[PurchaseFlowCoordinator] número de destino recebido, a prosseguir'
    );
    await this.#registerAndAdvance(transaction, contextKey, raw, pendingDestination.metadata);
  }

  /**
   * Ponto único que regista a alegação (Fase 4) e reage aos três
   * resultados possíveis — reutilizado tanto no caminho direto (número já
   * vinha na mensagem) como no caminho retomado (número pedido à parte).
   */
  async #registerAndAdvance(transaction, contextKey, raw, metadata = {}) {
    const result = await this.#pendingTransactionManager.registerClaim(transaction, {
      contextKey,
      whatsappInstanceId: this.#tenantContext.whatsappInstanceId,
      rawMessageText: raw?.message?.conversation ?? raw?.message?.extendedTextMessage?.text ?? null,
      ...metadata,
    });

    if (result === null) {
      const session = await this.#sessionManager.transition(contextKey, SessionState.AWAITING_VERIFICATION, {
        currentTransactionId: transaction.externalTransactionId,
      });
      this.#logger.info(
        { contextKey, state: session.state, transactionId: transaction.externalTransactionId },
        '[PurchaseFlowCoordinator] alegação registada, a aguardar verificação real'
      );
      await this.#reply(
        contextKey,
        replyMessages.claimRegistered({
          transactionId: transaction.externalTransactionId,
          amount: transaction.amount,
          destinationNumber: transaction.destinationNumber,
        }),
        { quoted: raw }
      );
      return;
    }

    if (result.verified) {
      // Ordem invertida: já havia uma SMS real órfã à espera — cruzamento imediato.
      await this.#sessionManager.transition(contextKey, SessionState.AWAITING_VERIFICATION, {
        currentTransactionId: transaction.externalTransactionId,
      });
      this.#logger.info(
        { contextKey, transactionId: transaction.externalTransactionId },
        '[PurchaseFlowCoordinator] SMS real já estava à espera (ordem invertida) — verificado de imediato'
      );
      await this.#reply(
        contextKey,
        replyMessages.claimRegistered({
          transactionId: transaction.externalTransactionId,
          amount: transaction.amount,
          destinationNumber: transaction.destinationNumber,
        }),
        { quoted: raw }
      );
      await this.#advanceToProcessing(contextKey, result.transaction);
      return;
    }

    const session = await this.#sessionManager.transition(contextKey, SessionState.NOT_FOUND, {
      currentTransactionId: transaction.externalTransactionId,
    });
    this.#logger.warn(
      { contextKey, reason: result.reason, state: session.state },
      '[PurchaseFlowCoordinator] alegação rejeitada de imediato'
    );
    const message =
      result.reason === PaymentVerificationReason.ALREADY_USED
        ? replyMessages.claimRejectedAlreadyUsed({ transactionId: transaction.externalTransactionId })
        : replyMessages.claimRejectedGeneric();
    await this.#reply(contextKey, message, { quoted: raw });
  }

  async #onClaimVerified({ verification, contextKey }) {
    if (verification.verified) {
      await this.#advanceToProcessing(contextKey, verification.transaction);
    } else {
      const session = await this.#sessionManager.transition(contextKey, SessionState.NOT_FOUND);
      this.#logger.warn(
        { contextKey, state: session.state, reason: verification.reason },
        '[PurchaseFlowCoordinator] verificação falhou'
      );
      await this.#reply(contextKey, replyMessages.verificationFailed({ transactionId: verification.claimedTransactionId }));
    }
  }

  async #advanceToProcessing(contextKey, transaction) {
    const session = await this.#sessionManager.transition(contextKey, SessionState.PROCESSING);
    this.#logger.info({ contextKey, state: session.state }, '[PurchaseFlowCoordinator] verificado — a acionar USSD');

    const deliveryAmount = this.#resolveDeliveryAmount(transaction);

    this.#ussdCommandQueue?.enqueue({
      transactionId: transaction.externalTransactionId,
      contextKey,
      destinationNumber: transaction.destinationNumber,
      paymentAmount: transaction.amount,
      deliveryAmount,
    });
    // Sem mensagem extra aqui — "claimRegistered" já avisou o cliente que
    // está em processamento; a próxima mensagem só chega quando o USSD terminar.
  }

  #resolveDeliveryAmount(transaction) {
    if (transaction.deliveryAmount != null) return transaction.deliveryAmount;

    const configuredAmount = this.#priceTable?.resolveDeliveryAmount(transaction.amount);
    if (configuredAmount != null) return configuredAmount;

    this.#logger.warn(
      { transactionId: transaction.externalTransactionId, paymentAmount: transaction.amount },
      '[PurchaseFlowCoordinator] sem tabela de precos configurada; a usar valor pago como quantidade USSD'
    );
    return transaction.amount;
  }

  async #onClaimExpired({ verification, contextKey }) {
    const session = await this.#sessionManager.transition(contextKey, SessionState.NOT_FOUND);
    this.#logger.warn({ contextKey, state: session.state }, '[PurchaseFlowCoordinator] alegação expirou sem confirmação');
    await this.#reply(contextKey, replyMessages.claimExpired({ transactionId: verification.claimedTransactionId }));
  }

  async #onUssdCompleted({ command }) {
    const session = await this.#sessionManager.transition(command.contextKey, SessionState.COMPLETED);
    this.#logger.info(
      { contextKey: command.contextKey, state: session.state, destinationNumber: command.destinationNumber },
      '[PurchaseFlowCoordinator] megas entregues'
    );
    await this.#reply(
      command.contextKey,
      replyMessages.ussdCompleted({
        transactionId: command.transactionId,
        paymentAmount: command.paymentAmount,
        deliveryAmount: command.deliveryAmount,
        destinationNumber: command.destinationNumber,
        timestamp: new Date().toISOString(),
      })
    );
  }

  async #onUssdFailed({ command, details }) {
    const session = await this.#sessionManager.transition(command.contextKey, SessionState.NOT_FOUND);
    this.#logger.warn(
      { contextKey: command.contextKey, state: session.state, details },
      '[PurchaseFlowCoordinator] falha na execução do USSD — a escalar para suporte'
    );
    await this.#reply(command.contextKey, replyMessages.ussdFailed({ transactionId: command.transactionId }));
  }

  /**
   * Envia uma mensagem de volta ao chat de origem do contextKey. Nunca
   * lança — um erro ao enviar (ex: WhatsApp desligado) fica em log, não
   * deve impedir o resto do fluxo de negócio de continuar a funcionar.
   *
   * @param {object} [options]
   * @param {object} [options.quoted] - mensagem original do WhatsApp a
   *   citar (só disponível nas respostas dadas dentro do mesmo handler que
   *   recebeu a mensagem — ver payload.raw em WhatsAppEvents).
   */
  async #reply(contextKey, text, { quoted } = {}) {
    if (!this.#whatsAppProvider) return; // sem provider ligado (ex: testes) — ok, não faz nada

    try {
      const { chatId } = ContextKeyResolver.parse(contextKey);
      await this.#whatsAppProvider.sendText(chatId, text, { quoted });
    } catch (err) {
      this.#logger.error({ err, contextKey }, '[PurchaseFlowCoordinator] falha ao enviar resposta ao WhatsApp');
    }
  }
}
