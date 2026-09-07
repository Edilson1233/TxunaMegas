package mz.megasaas.core.payment;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

class PaymentServiceTest {

    private static final String TENANT_ID = "11111111-1111-1111-1111-111111111111";
    private static final String WHATSAPP_INSTANCE_ID = "default-instance";
    private static final String DEVICE_ID = "22222222-2222-2222-2222-222222222222";

    private final FakePaymentRepository repository = new FakePaymentRepository();
    private final PaymentService service = new PaymentService(repository);

    @Test
    void registerClaimPersistsPendingPaymentAndOrder() {
        PaymentDecisionResponse response = service.registerClaim(validClaim("TX1", "859253929"), "claim-key-1");

        assertThat(response.decision()).isEqualTo(PaymentDecision.PENDING_VERIFICATION);
        assertThat(response.orderId()).isNotNull();
        assertThat(response.paymentId()).isNotNull();
        assertThat(repository.claimCount).isEqualTo(1);
    }

    @Test
    void registerClaimRejectsWrongSource() {
        PaymentClaimRequest request = validClaim("TX1", "859253929");
        ParsedPaymentRequest parsed = parsedPayment("TX1", TransactionSource.TASKER_SMS, TransactionType.RECEIVED, "859253929");
        PaymentClaimRequest wrongSource = new PaymentClaimRequest(
                request.tenantId(),
                request.whatsappInstanceId(),
                request.contextKey(),
                request.chatType(),
                request.chatId(),
                request.userId(),
                request.messageId(),
                request.receivedAt(),
                request.rawMessageText(),
                parsed
        );

        PaymentDecisionResponse response = service.registerClaim(wrongSource, "claim-key-2");

        assertThat(response.decision()).isEqualTo(PaymentDecision.REJECTED);
        assertThat(response.reason()).isEqualTo(PaymentDecisionReason.INVALID_SOURCE);
    }

    @Test
    void registerClaimMatchesExistingOrphanSms() {
        PaymentDecisionResponse orphan = service.registerSmsConfirmation(validSms("TX1"), "sms-key-1");
        assertThat(orphan.decision()).isEqualTo(PaymentDecision.ORPHAN_CONFIRMATION_ACCEPTED);

        PaymentDecisionResponse response = service.registerClaim(validClaim("TX1", "859253929"), "claim-key-3");

        assertThat(response.decision()).isEqualTo(PaymentDecision.VERIFIED);
        assertThat(response.orderId()).isNotNull();
        assertThat(repository.payments.get(response.paymentId()).status()).isEqualTo(PaymentStatus.CONFIRMED);
    }

    @Test
    void registerSmsConfirmationMatchesExistingClaim() {
        PaymentDecisionResponse claim = service.registerClaim(validClaim("TX1", "859253929"), "claim-key-4");

        PaymentDecisionResponse response = service.registerSmsConfirmation(validSms("TX1"), "sms-key-2");

        assertThat(response.decision()).isEqualTo(PaymentDecision.VERIFIED);
        assertThat(response.paymentId()).isEqualTo(claim.paymentId());
        assertThat(response.contextKey()).isEqualTo("chat1");
        assertThat(response.destinationNumber()).isEqualTo("859253929");
    }

    @Test
    void registerSmsConfirmationRejectsTransferSentForDeliveryFlow() {
        SmsPaymentConfirmationRequest request = validSms("TX1", TransactionType.TRANSFER_SENT);

        PaymentDecisionResponse response = service.registerSmsConfirmation(request, "sms-key-3");

        assertThat(response.decision()).isEqualTo(PaymentDecision.REJECTED);
        assertThat(response.reason()).isEqualTo(PaymentDecisionReason.INVALID_TRANSACTION_TYPE);
    }

    @Test
    void replaysIdempotentResponseForSameOperation() {
        PaymentDecisionResponse first = service.registerClaim(validClaim("TX1", "859253929"), "same-key");
        PaymentDecisionResponse second = service.registerClaim(validClaim("TX2", "859253929"), "same-key");

        assertThat(second.paymentId()).isEqualTo(first.paymentId());
        assertThat(repository.claimCount).isEqualTo(1);
    }

    private PaymentClaimRequest validClaim(String transactionId, String destinationNumber) {
        return new PaymentClaimRequest(
                TENANT_ID,
                WHATSAPP_INSTANCE_ID,
                "chat1",
                ChatType.PRIVATE,
                "chat1",
                null,
                "msg-" + transactionId,
                OffsetDateTime.now(),
                "raw whatsapp text",
                parsedPayment(transactionId, TransactionSource.WHATSAPP_TEXT, TransactionType.RECEIVED, destinationNumber)
        );
    }

    private SmsPaymentConfirmationRequest validSms(String transactionId) {
        return validSms(transactionId, TransactionType.RECEIVED);
    }

    private SmsPaymentConfirmationRequest validSms(String transactionId, TransactionType type) {
        return new SmsPaymentConfirmationRequest(
                TENANT_ID,
                DEVICE_ID,
                PaymentProvider.MPESA,
                transactionId,
                new BigDecimal("210.00"),
                "raw sms",
                OffsetDateTime.now(),
                parsedPayment(transactionId, TransactionSource.TASKER_SMS, type, null)
        );
    }

    private ParsedPaymentRequest parsedPayment(
            String transactionId,
            TransactionSource source,
            TransactionType type,
            String destinationNumber
    ) {
        return new ParsedPaymentRequest(
                true,
                PaymentProvider.MPESA,
                type,
                transactionId,
                new BigDecimal("210.00"),
                BigDecimal.ZERO,
                "258846227063",
                "Cliente Teste",
                destinationNumber,
                new BigDecimal("326.78"),
                OffsetDateTime.now(),
                java.util.List.of(),
                "1.1.0",
                source
        );
    }

    private static final class FakePaymentRepository implements PaymentRepository {
        private final UUID whatsappInstanceId = UUID.fromString("33333333-3333-3333-3333-333333333333");
        private final Map<String, PaymentDecisionResponse> idempotency = new HashMap<>();
        private final Map<String, PaymentRecord> paymentsByExternalId = new HashMap<>();
        private final Map<UUID, PaymentRecord> payments = new HashMap<>();
        private final Map<UUID, String> orderContextKeys = new HashMap<>();
        private int claimCount;

        @Override
        public Optional<PaymentDecisionResponse> findIdempotentPaymentDecision(
                String tenantId,
                String idempotencyKey,
                String operation
        ) {
            return Optional.ofNullable(idempotency.get(operation + ":" + idempotencyKey));
        }

        @Override
        public void saveIdempotentPaymentDecision(
                String tenantId,
                String idempotencyKey,
                String operation,
                PaymentDecisionResponse response
        ) {
            idempotency.put(operation + ":" + idempotencyKey, response);
        }

        @Override
        public Optional<UUID> findWhatsappInstanceId(String tenantId, String instanceId) {
            return WHATSAPP_INSTANCE_ID.equals(instanceId) ? Optional.of(whatsappInstanceId) : Optional.empty();
        }

        @Override
        public boolean activeAutomationDeviceExists(String tenantId, String deviceId) {
            return DEVICE_ID.equals(deviceId);
        }

        @Override
        public Optional<PaymentRecord> findPayment(
                String tenantId,
                PaymentProvider provider,
                String externalTransactionId
        ) {
            return Optional.ofNullable(paymentsByExternalId.get(externalTransactionId));
        }

        @Override
        public UUID insertOrderForClaim(PaymentClaimRequest request, OrderStatus status) {
            UUID id = UUID.randomUUID();
            orderContextKeys.put(id, request.contextKey());
            return id;
        }

        @Override
        public UUID insertClaimedPayment(String tenantId, UUID orderId, ParsedPaymentRequest payment, PaymentStatus status) {
            UUID id = UUID.randomUUID();
            PaymentRecord record = new PaymentRecord(
                    id,
                    orderId,
                    orderContextKeys.get(orderId),
                    payment.provider(),
                    payment.externalTransactionId(),
                    payment.type(),
                    payment.amount(),
                    payment.destinationNumber(),
                    status
            );
            payments.put(id, record);
            paymentsByExternalId.put(payment.externalTransactionId(), record);
            return id;
        }

        @Override
        public void insertPaymentClaim(
                UUID paymentId,
                UUID whatsappInstanceId,
                PaymentClaimRequest request,
                PaymentClaimStatus status
        ) {
            claimCount += 1;
        }

        @Override
        public UUID insertOrphanPayment(String tenantId, ParsedPaymentRequest payment) {
            UUID id = UUID.randomUUID();
            PaymentRecord record = new PaymentRecord(
                    id,
                    null,
                    null,
                    payment.provider(),
                    payment.externalTransactionId(),
                    payment.type(),
                    payment.amount(),
                    payment.destinationNumber(),
                    PaymentStatus.ORPHAN
            );
            payments.put(id, record);
            paymentsByExternalId.put(payment.externalTransactionId(), record);
            return id;
        }

        @Override
        public void insertPaymentConfirmation(
                UUID paymentId,
                SmsPaymentConfirmationRequest request,
                PaymentConfirmationStatus status
        ) {
        }

        @Override
        public void markPaymentAndOrderVerified(UUID paymentId, UUID orderId, String destinationNumber) {
            PaymentRecord existing = payments.get(paymentId);
            PaymentRecord updated = new PaymentRecord(
                    existing.id(),
                    orderId != null ? orderId : existing.orderId(),
                    orderId != null ? orderContextKeys.get(orderId) : existing.contextKey(),
                    existing.provider(),
                    existing.externalTransactionId(),
                    existing.transactionType(),
                    existing.amount(),
                    destinationNumber != null ? destinationNumber : existing.destinationNumber(),
                    PaymentStatus.CONFIRMED
            );
            payments.put(paymentId, updated);
            paymentsByExternalId.put(updated.externalTransactionId(), updated);
        }
    }
}
