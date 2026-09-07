/**
 * replyMessages
 * ---------------
 * Textos das respostas automáticas enviadas ao cliente final. Centralizados
 * aqui para serem fáceis de rever/traduzir mais tarde (ex: personalização
 * por tenant, Fase 8), sem mexer na lógica do PurchaseFlowCoordinator.
 *
 * Cada função recebe um objeto de dados (nunca a Transaction/UssdCommand
 * inteiros — só os campos necessários) e devolve uma string já formatada,
 * pronta a enviar.
 */

function formatDateTime(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      timeZone: 'Africa/Maputo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return null;
  }
}

export const replyMessages = {
  claimRegistered: ({ transactionId, amount, destinationNumber } = {}) =>
    [
      '✅ *Pedido recebido!*',
      '',
      `💰 Referência: ${transactionId ?? '—'}`,
      amount != null ? `💵 Valor: ${amount}MT` : null,
      destinationNumber ? `📱 Número: ${destinationNumber}` : null,
      '',
      '⏳ _A confirmar o pagamento, aguarde um momento..._',
    ]
      .filter(Boolean)
      .join('\n'),

  stillProcessing: ({ transactionId } = {}) =>
    [
      '⏳ *Pedido em processamento*',
      '',
      transactionId ? `Referência: ${transactionId}` : null,
      '',
      'Já estamos a transferir os megas deste pedido. Aguarde a confirmação final.',
    ]
      .filter(Boolean)
      .join('\n'),

  askForDestinationNumber: ({ transactionId } = {}) =>
    [
      '✅ *Comprovativo recebido!*',
      '',
      transactionId ? `💰 Referência: ${transactionId}` : null,
      '',
      '📱 Para continuar, envie o número que vai receber os megas (ex: 8XXXXXXXX).',
    ]
      .filter(Boolean)
      .join('\n'),

  invalidDestinationNumber: () =>
    '⚠️ Esse não parece um número moçambicano válido. Envie só os 9 dígitos (ex: 841234567).',

  claimRejectedAlreadyUsed: ({ transactionId } = {}) =>
    [
      '⚠️ *Comprovativo já utilizado*',
      '',
      transactionId ? `Referência: ${transactionId}` : null,
      '',
      'Este comprovativo já foi usado noutro pedido. Se acha que é um engano, contacte o suporte.',
    ]
      .filter(Boolean)
      .join('\n'),

  claimRejectedGeneric: () =>
    '⚠️ Não foi possível identificar esse comprovativo. Verifique se colou a mensagem completa e tente novamente.',

  verificationFailed: ({ transactionId } = {}) =>
    [
      '⚠️ *Não foi possível confirmar o pagamento*',
      '',
      transactionId ? `Referência: ${transactionId}` : null,
      '',
      'Os dados não coincidem com o que recebemos. Contacte o suporte com o seu comprovativo.',
    ]
      .filter(Boolean)
      .join('\n'),

  claimExpired: ({ transactionId } = {}) =>
    [
      '⏳ *Ainda a confirmar*',
      '',
      transactionId ? `Referência: ${transactionId}` : null,
      '',
      'Ainda não conseguimos confirmar o seu pagamento. Se já pagou, aguarde mais um pouco — se demorar muito, contacte o suporte.',
    ]
      .filter(Boolean)
      .join('\n'),

  ussdCompleted: ({ transactionId, amount, paymentAmount, deliveryAmount, destinationNumber, timestamp } = {}) =>
    [
      '✅ *Transação concluída com sucesso*',
      '',
      destinationNumber ? `📱 Número: ${destinationNumber}` : null,
      (deliveryAmount ?? amount) != null ? `Megas: ${deliveryAmount ?? amount}MB` : null,
      paymentAmount != null ? `Valor pago: ${paymentAmount}MT` : null,
      transactionId ? `💰 Referência: ${transactionId}` : null,
      formatDateTime(timestamp) ? `🕐 Data/Hora: ${formatDateTime(timestamp)}` : null,
      '',
      '_Megas transferidos automaticamente. Obrigado pela preferência!_',
    ]
      .filter(Boolean)
      .join('\n'),

  ussdFailed: ({ transactionId } = {}) =>
    [
      '⚠️ *Problema ao transferir os megas*',
      '',
      transactionId ? `Referência: ${transactionId}` : null,
      '',
      'O pagamento foi confirmado, mas houve um problema na transferência. A nossa equipa foi notificada — contacte o suporte se não receber em breve.',
    ]
      .filter(Boolean)
      .join('\n'),
};
