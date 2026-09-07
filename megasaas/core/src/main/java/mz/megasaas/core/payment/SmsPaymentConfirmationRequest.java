package mz.megasaas.core.payment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record SmsPaymentConfirmationRequest(
        @NotBlank String tenantId,
        @NotBlank String deviceId,
        @NotNull PaymentProvider provider,
        @NotBlank String externalTransactionId,
        @NotNull BigDecimal amount,
        @NotBlank String rawSms,
        @NotNull OffsetDateTime reportedAt,
        @Valid @NotNull ParsedPaymentRequest parsedPayment
) {
}
