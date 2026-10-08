package mz.megasaas.core.catalog;

import java.time.OffsetDateTime;
import java.util.UUID;

public record ProductResponse(
        UUID id,
        String tenantId,
        String name,
        String description,
        CatalogStatus status,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
