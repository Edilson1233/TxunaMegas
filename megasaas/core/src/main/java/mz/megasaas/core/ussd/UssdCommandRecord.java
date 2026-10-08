package mz.megasaas.core.ussd;

import java.time.OffsetDateTime;
import java.util.UUID;

record UssdCommandRecord(
        UUID commandId,
        String tenantId,
        UUID orderId,
        UUID paymentId,
        String deviceId,
        String externalTransactionId,
        UssdCommandStatus status,
        OffsetDateTime createdAt
) {
    UssdCommandResponse toResponse() {
        return new UssdCommandResponse(commandId, tenantId, orderId, paymentId, status, createdAt);
    }
}
