package mz.megasaas.core.catalog;

import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/tenants/{tenantId}/catalog")
public class CatalogController {

    private final CatalogService catalogService;

    public CatalogController(CatalogService catalogService) {
        this.catalogService = catalogService;
    }

    @GetMapping("/products")
    public List<ProductResponse> listProducts(@PathVariable String tenantId) {
        return catalogService.listProducts(tenantId);
    }

    @PostMapping("/products")
    @ResponseStatus(HttpStatus.CREATED)
    public ProductResponse createProduct(
            @PathVariable String tenantId,
            @Valid @RequestBody CreateProductRequest request
    ) {
        return catalogService.createProduct(tenantId, request);
    }

    @PatchMapping("/products/{productId}")
    public ProductResponse updateProduct(
            @PathVariable String tenantId,
            @PathVariable UUID productId,
            @Valid @RequestBody UpdateProductRequest request
    ) {
        return catalogService.updateProduct(tenantId, productId, request);
    }

    @GetMapping("/products/{productId}/packages")
    public List<CatalogPackageResponse> listPackages(
            @PathVariable String tenantId,
            @PathVariable UUID productId
    ) {
        return catalogService.listPackages(tenantId, productId);
    }

    @PostMapping("/products/{productId}/packages")
    @ResponseStatus(HttpStatus.CREATED)
    public CatalogPackageResponse createPackage(
            @PathVariable String tenantId,
            @PathVariable UUID productId,
            @Valid @RequestBody CreateCatalogPackageRequest request
    ) {
        return catalogService.createPackage(tenantId, productId, request);
    }

    @PatchMapping("/packages/{packageId}")
    public CatalogPackageResponse updatePackage(
            @PathVariable String tenantId,
            @PathVariable UUID packageId,
            @Valid @RequestBody UpdateCatalogPackageRequest request
    ) {
        return catalogService.updatePackage(tenantId, packageId, request);
    }

    @GetMapping("/packages/{packageId}/prices")
    public List<PriceResponse> listPrices(
            @PathVariable String tenantId,
            @PathVariable UUID packageId
    ) {
        return catalogService.listPrices(tenantId, packageId);
    }

    @PostMapping("/packages/{packageId}/prices")
    @ResponseStatus(HttpStatus.CREATED)
    public PriceResponse createPrice(
            @PathVariable String tenantId,
            @PathVariable UUID packageId,
            @Valid @RequestBody CreatePriceRequest request
    ) {
        return catalogService.createPrice(tenantId, packageId, request);
    }
}
