package mz.megasaas.core.ussd;

import java.time.OffsetDateTime;
import java.util.UUID;

public record UssdCommandResponse(
        UUID commandId,
        String tenantId,
        UUID orderId,
        UUID paymentId,
        UssdCommandStatus status,
        OffsetDateTime createdAt
) {
}
