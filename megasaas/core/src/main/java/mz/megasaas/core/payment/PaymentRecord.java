package mz.megasaas.core.payment;

import java.math.BigDecimal;
import java.util.UUID;

record PaymentRecord(
        UUID id,
        UUID orderId,
        String contextKey,
        PaymentProvider provider,
        String externalTransactionId,
        TransactionType transactionType,
        BigDecimal amount,
        String destinationNumber,
        PaymentStatus status
) {
}
