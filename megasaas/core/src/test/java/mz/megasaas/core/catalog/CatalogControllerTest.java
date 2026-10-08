package mz.megasaas.core.catalog;

import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import mz.megasaas.core.config.InternalApiAuthInterceptor;
import mz.megasaas.core.config.InternalApiProperties;
import mz.megasaas.core.config.WebConfig;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(
        controllers = CatalogController.class,
        properties = "megasaas.core.internal-api-token=test-token"
)
@EnableConfigurationProperties(InternalApiProperties.class)
@Import({WebConfig.class, InternalApiAuthInterceptor.class})
class CatalogControllerTest {

    private static final String TENANT_ID = "11111111-1111-1111-1111-111111111111";
    private static final UUID PACKAGE_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private CatalogService catalogService;

    @Test
    void createPriceReturnsCreatedPrice() throws Exception {
        OffsetDateTime validFrom = OffsetDateTime.parse("2026-09-04T00:00:00Z");
        when(catalogService.createPrice(eq(TENANT_ID), eq(PACKAGE_ID), any(CreatePriceRequest.class)))
                .thenReturn(new PriceResponse(
                        UUID.fromString("44444444-4444-4444-4444-444444444444"),
                        TENANT_ID,
                        PACKAGE_ID,
                        new BigDecimal("15.00"),
                        "MZN",
                        validFrom,
                        null,
                        validFrom
                ));

        mockMvc.perform(post("/internal/v1/tenants/{tenantId}/catalog/packages/{packageId}/prices", TENANT_ID, PACKAGE_ID)
                        .header("Authorization", "Bearer test-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "amount": 15.00,
                                  "validFrom": "2026-09-04T00:00:00Z"
                                }
                                """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.packageId", equalTo(PACKAGE_ID.toString())))
                .andExpect(jsonPath("$.amount", equalTo(15.0)))
                .andExpect(jsonPath("$.currency", equalTo("MZN")));
    }

    @Test
    void rejectsRequestsWithoutInternalToken() throws Exception {
        mockMvc.perform(post("/internal/v1/tenants/{tenantId}/catalog/packages/{packageId}/prices", TENANT_ID, PACKAGE_ID)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "amount": 15.00,
                                  "validFrom": "2026-09-04T00:00:00Z"
                                }
                                """))
                .andExpect(status().isUnauthorized());
    }
}
