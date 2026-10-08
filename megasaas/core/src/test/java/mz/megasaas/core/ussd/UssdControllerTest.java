package mz.megasaas.core.ussd;

import static org.hamcrest.Matchers.equalTo;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

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
        controllers = UssdController.class,
        properties = "megasaas.core.internal-api-token=test-token"
)
@EnableConfigurationProperties(InternalApiProperties.class)
@Import({WebConfig.class, InternalApiAuthInterceptor.class})
class UssdControllerTest {

    private static final String TENANT_ID = "11111111-1111-1111-1111-111111111111";
    private static final String DEVICE_ID = "22222222-2222-2222-2222-222222222222";
    private static final UUID ORDER_ID = UUID.fromString("33333333-3333-3333-3333-333333333333");
    private static final UUID PAYMENT_ID = UUID.fromString("44444444-4444-4444-4444-444444444444");
    private static final UUID COMMAND_ID = UUID.fromString("55555555-5555-5555-5555-555555555555");
    private static final OffsetDateTime CREATED_AT = OffsetDateTime.parse("2026-09-04T00:00:00Z");

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private UssdService ussdService;

    @Test
    void registerCommandReturnsCreatedCommand() throws Exception {
        when(ussdService.registerCommand(any(UssdCommandCreateRequest.class), eq("idem-ussd-command-0001")))
                .thenReturn(new UssdCommandResponse(
                        COMMAND_ID,
                        TENANT_ID,
                        ORDER_ID,
                        PAYMENT_ID,
                        UssdCommandStatus.PENDING,
                        CREATED_AT
                ));

        mockMvc.perform(post("/internal/v1/ussd-commands")
                        .header("Authorization", "Bearer test-token")
                        .header("Idempotency-Key", "idem-ussd-command-0001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "tenantId": "%s",
                                  "deviceId": "%s",
                                  "orderId": "%s",
                                  "paymentId": "%s",
                                  "externalTransactionId": "DHQ6LCATVGK",
                                  "destinationNumber": "850108639",
                                  "amount": 600
                                }
                                """.formatted(TENANT_ID, DEVICE_ID, ORDER_ID, PAYMENT_ID)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.commandId", equalTo(COMMAND_ID.toString())))
                .andExpect(jsonPath("$.tenantId", equalTo(TENANT_ID)))
                .andExpect(jsonPath("$.status", equalTo("PENDING")));
    }

    @Test
    void acknowledgeCommandReturnsUpdatedCommand() throws Exception {
        when(ussdService.acknowledgeCommand(eq(COMMAND_ID), any(UssdCommandAckRequest.class)))
                .thenReturn(new UssdCommandResponse(
                        COMMAND_ID,
                        TENANT_ID,
                        ORDER_ID,
                        PAYMENT_ID,
                        UssdCommandStatus.COMPLETED,
                        CREATED_AT
                ));

        mockMvc.perform(post("/internal/v1/ussd-commands/{commandId}/ack", COMMAND_ID)
                        .header("Authorization", "Bearer test-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "success": true,
                                  "acknowledgedAt": "2026-09-04T00:01:00Z",
                                  "details": "Transferiste confirmado"
                                }
                                """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.commandId", equalTo(COMMAND_ID.toString())))
                .andExpect(jsonPath("$.status", equalTo("COMPLETED")));
    }

    @Test
    void rejectsRequestsWithoutInternalToken() throws Exception {
        mockMvc.perform(post("/internal/v1/ussd-commands")
                        .header("Idempotency-Key", "idem-ussd-command-0001")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "tenantId": "%s",
                                  "deviceId": "%s",
                                  "orderId": "%s",
                                  "paymentId": "%s",
                                  "externalTransactionId": "DHQ6LCATVGK",
                                  "destinationNumber": "850108639",
                                  "amount": 600
                                }
                                """.formatted(TENANT_ID, DEVICE_ID, ORDER_ID, PAYMENT_ID)))
                .andExpect(status().isUnauthorized());
    }
}
