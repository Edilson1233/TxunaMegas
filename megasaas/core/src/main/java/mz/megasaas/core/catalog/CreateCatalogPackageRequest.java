package mz.megasaas.core.catalog;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record CreateCatalogPackageRequest(
        @NotBlank @Size(max = 160) String name,
        @NotNull @Positive Integer allowanceMb,
        @Positive Integer validityDays,
        CatalogStatus status
) {
}
