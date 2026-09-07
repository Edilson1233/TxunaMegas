package mz.megasaas.core.tenant;

public record TenantContextResponse(
        String tenantId,
        String whatsappInstanceId,
        String displayName,
        TenantStatus status
) {
}
