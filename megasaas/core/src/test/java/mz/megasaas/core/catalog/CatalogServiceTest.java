package mz.megasaas.core.catalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mz.megasaas.core.api.ResourceNotFoundException;
import org.junit.jupiter.api.Test;

class CatalogServiceTest {

    private static final String TENANT_ID = "11111111-1111-1111-1111-111111111111";
    private static final UUID PRODUCT_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    private static final UUID PACKAGE_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");

    private final FakeCatalogRepository repository = new FakeCatalogRepository();
    private final CatalogService service = new CatalogService(repository);

    @Test
    void createProductDefaultsStatusToActive() {
        ProductResponse response = service.createProduct(
                TENANT_ID,
                new CreateProductRequest("Internet movel", "Pacotes de dados", null)
        );

        assertThat(response.name()).isEqualTo("Internet movel");
        assertThat(response.status()).isEqualTo(CatalogStatus.ACTIVE);
    }

    @Test
    void createPackageRequiresProductFromTenant() {
        assertThatThrownBy(() -> service.createPackage(
                TENANT_ID,
                PRODUCT_ID,
                new CreateCatalogPackageRequest("600MB", 600, 7, null)
        )).isInstanceOf(ResourceNotFoundException.class);
    }

    @Test
    void createPriceClosesOpenPricesAndDefaultsCurrency() {
        repository.products.put(PRODUCT_ID, product(PRODUCT_ID));
        repository.packages.put(PACKAGE_ID, catalogPackage(PACKAGE_ID, PRODUCT_ID));
        OffsetDateTime validFrom = OffsetDateTime.parse("2026-09-04T00:00:00Z");

        PriceResponse response = service.createPrice(
                TENANT_ID,
                PACKAGE_ID,
                new CreatePriceRequest(new BigDecimal("15.00"), null, validFrom, null)
        );

        assertThat(response.amount()).isEqualByComparingTo("15.00");
        assertThat(response.currency()).isEqualTo("MZN");
        assertThat(repository.closedOpenPricesAt).containsExactly(validFrom);
    }

    @Test
    void createPriceRejectsInvalidPeriod() {
        repository.products.put(PRODUCT_ID, product(PRODUCT_ID));
        repository.packages.put(PACKAGE_ID, catalogPackage(PACKAGE_ID, PRODUCT_ID));
        OffsetDateTime validFrom = OffsetDateTime.parse("2026-09-04T00:00:00Z");

        assertThatThrownBy(() -> service.createPrice(
                TENANT_ID,
                PACKAGE_ID,
                new CreatePriceRequest(new BigDecimal("15.00"), "MZN", validFrom, validFrom)
        )).isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("validTo");
    }

    private ProductResponse product(UUID id) {
        return new ProductResponse(
                id,
                TENANT_ID,
                "Internet movel",
                null,
                CatalogStatus.ACTIVE,
                OffsetDateTime.now(),
                OffsetDateTime.now()
        );
    }

    private CatalogPackageResponse catalogPackage(UUID id, UUID productId) {
        return new CatalogPackageResponse(
                id,
                TENANT_ID,
                productId,
                "600MB",
                600,
                7,
                CatalogStatus.ACTIVE,
                OffsetDateTime.now(),
                OffsetDateTime.now()
        );
    }

    private static final class FakeCatalogRepository implements CatalogRepository {
        private final Map<UUID, ProductResponse> products = new HashMap<>();
        private final Map<UUID, CatalogPackageResponse> packages = new HashMap<>();
        private final Map<UUID, List<PriceResponse>> prices = new HashMap<>();
        private final List<OffsetDateTime> closedOpenPricesAt = new ArrayList<>();

        @Override
        public boolean tenantExists(String tenantId) {
            return TENANT_ID.equals(tenantId);
        }

        @Override
        public List<ProductResponse> listProducts(String tenantId) {
            return List.copyOf(products.values());
        }

        @Override
        public Optional<ProductResponse> findProduct(String tenantId, UUID productId) {
            return Optional.ofNullable(products.get(productId));
        }

        @Override
        public ProductResponse insertProduct(String tenantId, String name, String description, CatalogStatus status) {
            UUID id = UUID.randomUUID();
            ProductResponse response = new ProductResponse(
                    id,
                    tenantId,
                    name,
                    description,
                    status,
                    OffsetDateTime.now(),
                    OffsetDateTime.now()
            );
            products.put(id, response);
            return response;
        }

        @Override
        public void updateProduct(
                String tenantId,
                UUID productId,
                String name,
                String description,
                CatalogStatus status
        ) {
        }

        @Override
        public List<CatalogPackageResponse> listPackages(String tenantId, UUID productId) {
            return packages.values().stream()
                    .filter(item -> item.productId().equals(productId))
                    .toList();
        }

        @Override
        public Optional<CatalogPackageResponse> findPackage(String tenantId, UUID packageId) {
            return Optional.ofNullable(packages.get(packageId));
        }

        @Override
        public CatalogPackageResponse insertPackage(
                String tenantId,
                UUID productId,
                String name,
                Integer allowanceMb,
                Integer validityDays,
                CatalogStatus status
        ) {
            UUID id = UUID.randomUUID();
            CatalogPackageResponse response = new CatalogPackageResponse(
                    id,
                    tenantId,
                    productId,
                    name,
                    allowanceMb,
                    validityDays,
                    status,
                    OffsetDateTime.now(),
                    OffsetDateTime.now()
            );
            packages.put(id, response);
            return response;
        }

        @Override
        public void updatePackage(
                String tenantId,
                UUID packageId,
                String name,
                Integer allowanceMb,
                Integer validityDays,
                CatalogStatus status
        ) {
        }

        @Override
        public List<PriceResponse> listPrices(String tenantId, UUID packageId) {
            return prices.getOrDefault(packageId, List.of());
        }

        @Override
        public PriceResponse insertPrice(
                String tenantId,
                UUID packageId,
                BigDecimal amount,
                String currency,
                OffsetDateTime validFrom,
                OffsetDateTime validTo
        ) {
            PriceResponse response = new PriceResponse(
                    UUID.randomUUID(),
                    tenantId,
                    packageId,
                    amount,
                    currency,
                    validFrom,
                    validTo,
                    OffsetDateTime.now()
            );
            prices.computeIfAbsent(packageId, ignored -> new ArrayList<>()).add(response);
            return response;
        }

        @Override
        public void closeOpenPrices(String tenantId, UUID packageId, OffsetDateTime validTo) {
            closedOpenPricesAt.add(validTo);
        }
    }
}
