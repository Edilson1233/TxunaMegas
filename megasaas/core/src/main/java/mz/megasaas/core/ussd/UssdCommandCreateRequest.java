package mz.megasaas.core.ussd;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public record UssdCommandCreateRequest(
        @NotBlank String tenantId,
        @NotBlank String deviceId,
        @NotNull UUID orderId,
        @NotNull UUID paymentId,
        @NotBlank String externalTransactionId,
        @NotBlank String destinationNumber,
        @NotNull @DecimalMin("0.00") BigDecimal amount
) {
}
