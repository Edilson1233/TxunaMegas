package mz.megasaas.core.payment;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
        "spring.flyway.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:megasaas_core_json_test;MODE=PostgreSQL",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "megasaas.core.internal-api-token=test-token"
})
class PaymentDecisionJsonTest {

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void serializesIdempotentPaymentDecisionWithTimestamp() throws Exception {
        PaymentDecisionResponse response = new PaymentDecisionResponse(
                PaymentDecision.PENDING_VERIFICATION,
                null,
                "11111111-1111-1111-1111-111111111111",
                UUID.randomUUID(),
                UUID.randomUUID(),
                "chat@g.us::user@lid",
                "DIAGTX000001",
                new BigDecimal("15.00"),
                "859253929",
                600,
                null,
                OffsetDateTime.parse("2026-10-08T15:37:35Z")
        );

        String json = objectMapper.writeValueAsString(response);

        assertThat(json).contains("\"checkedAt\"");
        assertThat(objectMapper.readValue(json, PaymentDecisionResponse.class).checkedAt()).isNotNull();
    }
}
