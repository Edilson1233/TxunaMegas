package mz.megasaas.core.tenant;

import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

@Service
public class TenantContextService {

    private final JdbcClient jdbcClient;

    public TenantContextService(JdbcClient jdbcClient) {
        this.jdbcClient = jdbcClient;
    }

    public Optional<TenantContextResponse> resolveForWhatsappInstance(String instanceId) {
        return jdbcClient.sql("""
                        select
                            t.id::text as tenant_id,
                            wi.instance_id as whatsapp_instance_id,
                            t.display_name as display_name,
                            t.status as tenant_status
                        from whatsapp_instances wi
                        join tenants t on t.id = wi.tenant_id
                        where wi.instance_id = :instanceId
                          and wi.status <> 'DISABLED'
                        """)
                .param("instanceId", instanceId)
                .query((rs, rowNum) -> new TenantContextResponse(
                        rs.getString("tenant_id"),
                        rs.getString("whatsapp_instance_id"),
                        rs.getString("display_name"),
                        TenantStatus.valueOf(rs.getString("tenant_status"))
                ))
                .optional();
    }
}
