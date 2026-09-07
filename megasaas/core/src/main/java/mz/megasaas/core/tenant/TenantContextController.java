package mz.megasaas.core.tenant;

import mz.megasaas.core.api.ResourceNotFoundException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/tenant-context")
public class TenantContextController {

    private final TenantContextService tenantContextService;

    public TenantContextController(TenantContextService tenantContextService) {
        this.tenantContextService = tenantContextService;
    }

    @GetMapping("/whatsapp-instances/{instanceId}")
    public TenantContextResponse resolveTenantForWhatsappInstance(@PathVariable String instanceId) {
        return tenantContextService.resolveForWhatsappInstance(instanceId)
                .orElseThrow(() -> new ResourceNotFoundException("WhatsApp instance not found: " + instanceId));
    }
}
