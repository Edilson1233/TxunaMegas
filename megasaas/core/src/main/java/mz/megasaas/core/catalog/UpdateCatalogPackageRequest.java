package mz.megasaas.core.catalog;

import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record UpdateCatalogPackageRequest(
        @Size(max = 160) String name,
        @Positive Integer allowanceMb,
        @Positive Integer validityDays,
        CatalogStatus status
) {
}
