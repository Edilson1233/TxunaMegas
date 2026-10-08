package mz.megasaas.core.catalog;

import java.time.OffsetDateTime;
import java.util.UUID;

public record CatalogPackageResponse(
        UUID id,
        String tenantId,
        UUID productId,
        String name,
        Integer allowanceMb,
        Integer validityDays,
        CatalogStatus status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
