package mz.megasaas.core.payment;

import java.util.Optional;
import java.util.UUID;

interface PaymentRepository {

    Optional<PaymentDecisionResponse> findIdempotentPaymentDecision(String tenantId, String idempotencyKey, String operation);

    void saveIdempotentPaymentDecision(String tenantId, String idempotencyKey, String operation, PaymentDecisionResponse response);

    Optional<UUID> findWhatsappInstanceId(String tenantId, String instanceId);

    boolean activeAutomationDeviceExists(String tenantId, String deviceId);

    Optional<PaymentRecord> findPayment(String tenantId, PaymentProvider provider, String externalTransactionId);

    UUID insertOrderForClaim(PaymentClaimRequest request, OrderStatus status);

    UUID insertClaimedPayment(String tenantId, UUID orderId, ParsedPaymentRequest payment, PaymentStatus status);

    void insertPaymentClaim(UUID paymentId, UUID whatsappInstanceId, PaymentClaimRequest request, PaymentClaimStatus status);

    UUID insertOrphanPayment(String tenantId, ParsedPaymentRequest payment);

    void insertPaymentConfirmation(UUID paymentId, SmsPaymentConfirmationRequest request, PaymentConfirmationStatus status);

    void markPaymentAndOrderVerified(UUID paymentId, UUID orderId, String destinationNumber);
}
