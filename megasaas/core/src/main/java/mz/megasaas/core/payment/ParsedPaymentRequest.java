package mz.megasaas.core.payment;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public record ParsedPaymentRequest(
        @NotNull Boolean matched,
        @NotNull PaymentProvider provider,
        @NotNull TransactionType type,
        String externalTransactionId,
        BigDecimal amount,
        BigDecimal fee,
        String counterpartyPhone,
        String counterpartyName,
        String destinationNumber,
        BigDecimal balanceAfter,
        OffsetDateTime occurredAt,
        List<String> warnings,
        @NotNull String parserVersion,
        @NotNull TransactionSource source
) {
}
