package mz.megasaas.core.catalog;

import jakarta.validation.constraints.Size;

public record UpdateProductRequest(
        @Size(max = 160) String name,
        String description,
        CatalogStatus status
) {
}
