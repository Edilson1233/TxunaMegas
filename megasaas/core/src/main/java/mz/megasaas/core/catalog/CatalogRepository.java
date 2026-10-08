package mz.megasaas.core.catalog;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

interface CatalogRepository {

    boolean tenantExists(String tenantId);

    List<ProductResponse> listProducts(String tenantId);

    Optional<ProductResponse> findProduct(String tenantId, UUID productId);

    ProductResponse insertProduct(String tenantId, String name, String description, CatalogStatus status);

    void updateProduct(String tenantId, UUID productId, String name, String description, CatalogStatus status);

    List<CatalogPackageResponse> listPackages(String tenantId, UUID productId);

    Optional<CatalogPackageResponse> findPackage(String tenantId, UUID packageId);

    CatalogPackageResponse insertPackage(
            String tenantId,
            UUID productId,
            String name,
            Integer allowanceMb,
            Integer validityDays,
            CatalogStatus status
    );

    void updatePackage(
            String tenantId,
            UUID packageId,
            String name,
            Integer allowanceMb,
            Integer validityDays,
            CatalogStatus status
    );

    List<PriceResponse> listPrices(String tenantId, UUID packageId);

    PriceResponse insertPrice(
            String tenantId,
            UUID packageId,
            BigDecimal amount,
            String currency,
            OffsetDateTime validFrom,
            OffsetDateTime validTo
    );

    void closeOpenPrices(String tenantId, UUID packageId, OffsetDateTime validTo);
}
