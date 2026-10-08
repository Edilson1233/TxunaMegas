package mz.megasaas.core.catalog;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CreateProductRequest(
        @NotBlank @Size(max = 160) String name,
        String description,
        CatalogStatus status
) {
}
