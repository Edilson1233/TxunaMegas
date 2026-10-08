package mz.megasaas.core.catalog;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcCatalogRepository implements CatalogRepository {

    private final JdbcClient jdbcClient;

    JdbcCatalogRepository(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    @Override
    public boolean tenantExists(String tenantId) {
        return jdbcClient.sql("""
                        select count(*)
                        from tenants
                        where id = cast(:tenantId as uuid)
                          and status <> 'DISABLED'
                        """)
                .param("tenantId", tenantId)
                .query(Integer.class)
                .single() > 0;
    }

    @Override
    public List<ProductResponse> listProducts(String tenantId) {
        return jdbcClient.sql("""
                        select id, tenant_id, name, description, status, created_at, updated_at
                        from products
                        where tenant_id = cast(:tenantId as uuid)
                        order by created_at desc, name asc
                        """)
                .param("tenantId", tenantId)
                .query((rs, rowNum) -> productResponse(rs))
                .list();
    }

    @Override
    public Optional<ProductResponse> findProduct(String tenantId, UUID productId) {
        return jdbcClient.sql("""
                        select id, tenant_id, name, description, status, created_at, updated_at
                        from products
                        where tenant_id = cast(:tenantId as uuid)
                          and id = cast(:productId as uuid)
                        """)
                .param("tenantId", tenantId)
                .param("productId", productId.toString())
                .query((rs, rowNum) -> productResponse(rs))
                .optional();
    }

    @Override
    public ProductResponse insertProduct(
            String tenantId,
            String name,
            String description,
            CatalogStatus status
    ) {
        UUID id = UUID.randomUUID();
        jdbcClient.sql("""
                        insert into products (id, tenant_id, name, description, status)
                        values (cast(:id as uuid), cast(:tenantId as uuid), :name, :description, :status)
                        """)
                .param("id", id.toString())
                .param("tenantId", tenantId)
                .param("name", name)
                .param("description", description)
                .param("status", status.name())
                .update();
        return findProduct(tenantId, id).orElseThrow();
    }

    @Override
    public void updateProduct(
            String tenantId,
            UUID productId,
            String name,
            String description,
            CatalogStatus status
    ) {
        jdbcClient.sql("""
                        update products
                        set name = coalesce(:name, name),
                            description = coalesce(:description, description),
                            status = coalesce(:status, status),
                            updated_at = now()
                        where tenant_id = cast(:tenantId as uuid)
                          and id = cast(:productId as uuid)
                        """)
                .param("tenantId", tenantId)
                .param("productId", productId.toString())
                .param("name", name)
                .param("description", description)
                .param("status", status != null ? status.name() : null)
                .update();
    }

    @Override
    public List<CatalogPackageResponse> listPackages(String tenantId, UUID productId) {
        return jdbcClient.sql("""
                        select id, tenant_id, product_id, name, allowance_mb, validity_days,
                               status, created_at, updated_at
                        from product_packages
                        where tenant_id = cast(:tenantId as uuid)
                          and product_id = cast(:productId as uuid)
                        order by created_at desc, name asc
                        """)
                .param("tenantId", tenantId)
                .param("productId", productId.toString())
                .query((rs, rowNum) -> packageResponse(rs))
                .list();
    }

    @Override
    public Optional<CatalogPackageResponse> findPackage(String tenantId, UUID packageId) {
        return jdbcClient.sql("""
                        select id, tenant_id, product_id, name, allowance_mb, validity_days,
                               status, created_at, updated_at
                        from product_packages
                        where tenant_id = cast(:tenantId as uuid)
                          and id = cast(:packageId as uuid)
                        """)
                .param("tenantId", tenantId)
                .param("packageId", packageId.toString())
                .query((rs, rowNum) -> packageResponse(rs))
                .optional();
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
        jdbcClient.sql("""
                        insert into product_packages (
                            id, tenant_id, product_id, name, allowance_mb, validity_days, status
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), cast(:productId as uuid),
                            :name, :allowanceMb, :validityDays, :status
                        )
                        """)
                .param("id", id.toString())
                .param("tenantId", tenantId)
                .param("productId", productId.toString())
                .param("name", name)
                .param("allowanceMb", allowanceMb)
                .param("validityDays", validityDays)
                .param("status", status.name())
                .update();
        return findPackage(tenantId, id).orElseThrow();
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
        jdbcClient.sql("""
                        update product_packages
                        set name = coalesce(:name, name),
                            allowance_mb = coalesce(:allowanceMb, allowance_mb),
                            validity_days = coalesce(:validityDays, validity_days),
                            status = coalesce(:status, status),
                            updated_at = now()
                        where tenant_id = cast(:tenantId as uuid)
                          and id = cast(:packageId as uuid)
                        """)
                .param("tenantId", tenantId)
                .param("packageId", packageId.toString())
                .param("name", name)
                .param("allowanceMb", allowanceMb)
                .param("validityDays", validityDays)
                .param("status", status != null ? status.name() : null)
                .update();
    }

    @Override
    public List<PriceResponse> listPrices(String tenantId, UUID packageId) {
        return jdbcClient.sql("""
                        select id, tenant_id, package_id, amount, currency, valid_from, valid_to, created_at
                        from prices
                        where tenant_id = cast(:tenantId as uuid)
                          and package_id = cast(:packageId as uuid)
                        order by valid_from desc, created_at desc
                        """)
                .param("tenantId", tenantId)
                .param("packageId", packageId.toString())
                .query((rs, rowNum) -> priceResponse(rs))
                .list();
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
        UUID id = UUID.randomUUID();
        jdbcClient.sql("""
                        insert into prices (
                            id, tenant_id, package_id, amount, currency, valid_from, valid_to
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), cast(:packageId as uuid),
                            :amount, :currency, :validFrom, :validTo
                        )
                        """)
                .param("id", id.toString())
                .param("tenantId", tenantId)
                .param("packageId", packageId.toString())
                .param("amount", amount)
                .param("currency", currency)
                .param("validFrom", validFrom)
                .param("validTo", validTo)
                .update();
        return listPrices(tenantId, packageId).stream()
                .filter(price -> price.id().equals(id))
                .findFirst()
                .orElseThrow();
    }

    @Override
    public void closeOpenPrices(String tenantId, UUID packageId, OffsetDateTime validTo) {
        jdbcClient.sql("""
                        update prices
                        set valid_to = :validTo
                        where tenant_id = cast(:tenantId as uuid)
                          and package_id = cast(:packageId as uuid)
                          and valid_from < :validTo
                          and (valid_to is null or valid_to > :validTo)
                        """)
                .param("tenantId", tenantId)
                .param("packageId", packageId.toString())
                .param("validTo", validTo)
                .update();
    }

    private ProductResponse productResponse(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new ProductResponse(
                rs.getObject("id", UUID.class),
                rs.getString("tenant_id"),
                rs.getString("name"),
                rs.getString("description"),
                CatalogStatus.valueOf(rs.getString("status")),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
        );
    }

    private CatalogPackageResponse packageResponse(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new CatalogPackageResponse(
                rs.getObject("id", UUID.class),
                rs.getString("tenant_id"),
                rs.getObject("product_id", UUID.class),
                rs.getString("name"),
                rs.getObject("allowance_mb", Integer.class),
                rs.getObject("validity_days", Integer.class),
                CatalogStatus.valueOf(rs.getString("status")),
                rs.getObject("created_at", OffsetDateTime.class),
                rs.getObject("updated_at", OffsetDateTime.class)
        );
    }

    private PriceResponse priceResponse(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new PriceResponse(
                rs.getObject("id", UUID.class),
                rs.getString("tenant_id"),
                rs.getObject("package_id", UUID.class),
                rs.getBigDecimal("amount"),
                rs.getString("currency").trim(),
                rs.getObject("valid_from", OffsetDateTime.class),
                rs.getObject("valid_to", OffsetDateTime.class),
                rs.getObject("created_at", OffsetDateTime.class)
        );
    }
}
