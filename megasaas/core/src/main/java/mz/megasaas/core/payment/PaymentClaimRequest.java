package mz.megasaas.core.payment;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;

public record PaymentClaimRequest(
        @NotBlank String tenantId,
        @NotBlank String whatsappInstanceId,
        @NotBlank String contextKey,
        @NotNull ChatType chatType,
        @NotBlank String chatId,
        String userId,
        @NotBlank String messageId,
        @NotNull OffsetDateTime receivedAt,
        String rawMessageText,
        @Valid @NotNull ParsedPaymentRequest parsedPayment
) {
}
