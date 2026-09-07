package mz.megasaas.core.tenant;

import static org.hamcrest.Matchers.equalTo;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import mz.megasaas.core.config.InternalApiAuthInterceptor;
import mz.megasaas.core.config.InternalApiProperties;
import mz.megasaas.core.config.WebConfig;

@WebMvcTest(
        controllers = TenantContextController.class,
        properties = "megasaas.core.internal-api-token=test-token"
)
@EnableConfigurationProperties(InternalApiProperties.class)
@Import({WebConfig.class, InternalApiAuthInterceptor.class})
class TenantContextControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private TenantContextService tenantContextService;

    @Test
    void resolvesTenantForWhatsappInstance() throws Exception {
        when(tenantContextService.resolveForWhatsappInstance("default-instance"))
                .thenReturn(Optional.of(new TenantContextResponse(
                        "tenant-1",
                        "default-instance",
                        "Default Tenant",
                        TenantStatus.ACTIVE
                )));

        mockMvc.perform(get("/internal/v1/tenant-context/whatsapp-instances/default-instance")
                        .header("Authorization", "Bearer test-token"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tenantId", equalTo("tenant-1")))
                .andExpect(jsonPath("$.whatsappInstanceId", equalTo("default-instance")))
                .andExpect(jsonPath("$.status", equalTo("ACTIVE")));
    }

    @Test
    void rejectsRequestsWithoutInternalToken() throws Exception {
        mockMvc.perform(get("/internal/v1/tenant-context/whatsapp-instances/default-instance"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void returnsNotFoundWhenInstanceDoesNotExist() throws Exception {
        when(tenantContextService.resolveForWhatsappInstance("missing"))
                .thenReturn(Optional.empty());

        mockMvc.perform(get("/internal/v1/tenant-context/whatsapp-instances/missing")
                        .header("Authorization", "Bearer test-token"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code", equalTo("NOT_FOUND")));
    }
}
