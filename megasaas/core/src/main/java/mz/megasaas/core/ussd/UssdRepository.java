package mz.megasaas.core.ussd;

import java.util.Optional;
import java.util.UUID;

interface UssdRepository {

    Optional<UssdCommandResponse> findIdempotentResponse(String tenantId, String idempotencyKey, String operation);

    void saveIdempotentResponse(String tenantId, String idempotencyKey, String operation, UssdCommandResponse response);

    boolean activeAutomationDeviceExists(String tenantId, String deviceId);

    boolean orderPaymentPairExists(String tenantId, UUID orderId, UUID paymentId);

    Optional<UssdCommandRecord> findActiveByOrderPayment(String tenantId, UUID orderId, UUID paymentId);

    Optional<UssdCommandRecord> findById(UUID commandId);

    UssdCommandRecord insert(UssdCommandCreateRequest request);

    UssdCommandRecord updateAck(UUID commandId, UssdCommandStatus status, String lastError);

    void markOrderCompleted(UUID orderId);

    void markOrderFailed(UUID orderId);

    void markPaymentUsed(UUID paymentId);

    void insertAuditEvent(AuditEvent event);
}
