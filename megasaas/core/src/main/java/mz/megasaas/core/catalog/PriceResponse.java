package mz.megasaas.core.catalog;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record PriceResponse(
        UUID id,
        String tenantId,
        UUID packageId,
        BigDecimal amount,
        String currency,
        OffsetDateTime validFrom,
        OffsetDateTime validTo,
        OffsetDateTime createdAt
) {
}
