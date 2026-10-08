package mz.megasaas.core.catalog;

import java.util.List;
import java.util.UUID;
import mz.megasaas.core.api.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class CatalogService {

    private static final String DEFAULT_CURRENCY = "MZN";

    private final CatalogRepository repository;

    public CatalogService(CatalogRepository repository) {
        this.repository = repository;
    }

    public List<ProductResponse> listProducts(String tenantId) {
        requireTenant(tenantId);
        return repository.listProducts(tenantId);
    }

    @Transactional
    public ProductResponse createProduct(String tenantId, CreateProductRequest request) {
        requireTenant(tenantId);
        return repository.insertProduct(
                tenantId,
                requireText(request.name(), "Product name is required"),
                normalizeBlank(request.description()),
                defaultStatus(request.status())
        );
    }

    @Transactional
    public ProductResponse updateProduct(String tenantId, UUID productId, UpdateProductRequest request) {
        requireProduct(tenantId, productId);
        repository.updateProduct(
                tenantId,
                productId,
                normalizeOptionalName(request.name(), "Product name cannot be blank"),
                normalizeBlank(request.description()),
                request.status()
        );
        return requireProduct(tenantId, productId);
    }

    public List<CatalogPackageResponse> listPackages(String tenantId, UUID productId) {
        requireProduct(tenantId, productId);
        return repository.listPackages(tenantId, productId);
    }

    @Transactional
    public CatalogPackageResponse createPackage(
            String tenantId,
            UUID productId,
            CreateCatalogPackageRequest request
    ) {
        requireProduct(tenantId, productId);
        return repository.insertPackage(
                tenantId,
                productId,
                requireText(request.name(), "Package name is required"),
                request.allowanceMb(),
                request.validityDays(),
                defaultStatus(request.status())
        );
    }

    @Transactional
    public CatalogPackageResponse updatePackage(
            String tenantId,
            UUID packageId,
            UpdateCatalogPackageRequest request
    ) {
        requirePackage(tenantId, packageId);
        repository.updatePackage(
                tenantId,
                packageId,
                normalizeOptionalName(request.name(), "Package name cannot be blank"),
                request.allowanceMb(),
                request.validityDays(),
                request.status()
        );
        return requirePackage(tenantId, packageId);
    }

    public List<PriceResponse> listPrices(String tenantId, UUID packageId) {
        requirePackage(tenantId, packageId);
        return repository.listPrices(tenantId, packageId);
    }

    @Transactional
    public PriceResponse createPrice(String tenantId, UUID packageId, CreatePriceRequest request) {
        requirePackage(tenantId, packageId);
        if (request.validTo() != null && !request.validTo().isAfter(request.validFrom())) {
            throw new IllegalArgumentException("Price validTo must be after validFrom");
        }

        repository.closeOpenPrices(tenantId, packageId, request.validFrom());
        return repository.insertPrice(
                tenantId,
                packageId,
                request.amount(),
                normalizeCurrency(request.currency()),
                request.validFrom(),
                request.validTo()
        );
    }

    private void requireTenant(String tenantId) {
        if (!repository.tenantExists(tenantId)) {
            throw new ResourceNotFoundException("Tenant not found: " + tenantId);
        }
    }

    private ProductResponse requireProduct(String tenantId, UUID productId) {
        requireTenant(tenantId);
        return repository.findProduct(tenantId, productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found: " + productId));
    }

    private CatalogPackageResponse requirePackage(String tenantId, UUID packageId) {
        requireTenant(tenantId);
        return repository.findPackage(tenantId, packageId)
                .orElseThrow(() -> new ResourceNotFoundException("Package not found: " + packageId));
    }

    private CatalogStatus defaultStatus(CatalogStatus status) {
        return status != null ? status : CatalogStatus.ACTIVE;
    }

    private String requireText(String value, String message) {
        String normalized = normalizeBlank(value);
        if (normalized == null) {
            throw new IllegalArgumentException(message);
        }
        return normalized;
    }

    private String normalizeOptionalName(String value, String message) {
        if (value == null) {
            return null;
        }
        return requireText(value, message);
    }

    private String normalizeBlank(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private String normalizeCurrency(String currency) {
        String normalized = currency == null || currency.isBlank()
                ? DEFAULT_CURRENCY
                : currency.trim().toUpperCase();
        if (!normalized.matches("[A-Z]{3}")) {
            throw new IllegalArgumentException("Currency must be a 3-letter ISO code");
        }
        return normalized;
    }
}
