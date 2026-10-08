package mz.megasaas.core.catalog;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.OffsetDateTime;

public record CreatePriceRequest(
        @NotNull @DecimalMin("0.00") BigDecimal amount,
        @Size(min = 3, max = 3) String currency,
        @NotNull OffsetDateTime validFrom,
        OffsetDateTime validTo
) {
}
