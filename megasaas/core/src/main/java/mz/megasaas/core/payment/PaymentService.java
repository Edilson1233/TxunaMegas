package mz.megasaas.core.payment;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentService {

    private static final String CLAIM_OPERATION = "payment-claim";
    private static final String SMS_CONFIRMATION_OPERATION = "sms-payment-confirmation";

    private final PaymentRepository repository;

    public PaymentService(PaymentRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public PaymentDecisionResponse registerClaim(PaymentClaimRequest request, String idempotencyKey) {
        Optional<PaymentDecisionResponse> replay =
                repository.findIdempotentPaymentDecision(request.tenantId(), idempotencyKey, CLAIM_OPERATION);
        if (replay.isPresent()) {
            return replay.get();
        }

        PaymentDecisionResponse response = registerClaimOnce(request);
        repository.saveIdempotentPaymentDecision(request.tenantId(), idempotencyKey, CLAIM_OPERATION, response);
        return response;
    }

    @Transactional
    public PaymentDecisionResponse registerSmsConfirmation(
            SmsPaymentConfirmationRequest request,
            String idempotencyKey
    ) {
        Optional<PaymentDecisionResponse> replay =
                repository.findIdempotentPaymentDecision(request.tenantId(), idempotencyKey, SMS_CONFIRMATION_OPERATION);
        if (replay.isPresent()) {
            return replay.get();
        }

        PaymentDecisionResponse response = registerSmsConfirmationOnce(request);
        repository.saveIdempotentPaymentDecision(request.tenantId(), idempotencyKey, SMS_CONFIRMATION_OPERATION, response);
        return response;
    }

    private PaymentDecisionResponse registerClaimOnce(PaymentClaimRequest request) {
        ParsedPaymentRequest claim = request.parsedPayment();
        PaymentDecisionResponse invalid = validateParsedPayment(
                request.tenantId(),
                claim,
                TransactionSource.WHATSAPP_TEXT
        );
        if (invalid != null) {
            return invalid;
        }

        Optional<UUID> whatsappInstanceId =
                repository.findWhatsappInstanceId(request.tenantId(), request.whatsappInstanceId());
        if (whatsappInstanceId.isEmpty()) {
            return PaymentDecisionResponse.rejected(
                    request.tenantId(),
                    null,
                    null,
                    claim.externalTransactionId(),
                    claim.amount(),
                    claim.destinationNumber(),
                    PaymentDecisionReason.TENANT_DISABLED
            );
        }

        Optional<PaymentRecord> existing =
                repository.findPayment(request.tenantId(), claim.provider(), claim.externalTransactionId());
        if (existing.isPresent()) {
            return resolveExistingPaymentForClaim(request, claim, whatsappInstanceId.get(), existing.get());
        }

        UUID orderId = repository.insertOrderForClaim(request, OrderStatus.PENDING_PAYMENT);
        UUID paymentId = repository.insertClaimedPayment(request.tenantId(), orderId, claim, PaymentStatus.CLAIMED);
        repository.insertPaymentClaim(paymentId, whatsappInstanceId.get(), request, PaymentClaimStatus.PENDING);
        return PaymentDecisionResponse.pending(request.tenantId(), orderId, paymentId, request.contextKey(), claim);
    }

    private PaymentDecisionResponse resolveExistingPaymentForClaim(
            PaymentClaimRequest request,
            ParsedPaymentRequest claim,
            UUID whatsappInstanceId,
            PaymentRecord existing
    ) {
        if (existing.status() == PaymentStatus.ORPHAN) {
            if (!sameAmount(existing.amount(), claim.amount())) {
                repository.insertPaymentClaim(existing.id(), whatsappInstanceId, request, PaymentClaimStatus.REJECTED);
                return rejectedForExisting(request.tenantId(), existing, PaymentDecisionReason.AMOUNT_MISMATCH);
            }

            UUID orderId = repository.insertOrderForClaim(request, OrderStatus.PAYMENT_VERIFIED);
            repository.markPaymentAndOrderVerified(existing.id(), orderId, claim.destinationNumber());
            repository.insertPaymentClaim(existing.id(), whatsappInstanceId, request, PaymentClaimStatus.MATCHED);
            return PaymentDecisionResponse.verified(request.tenantId(), orderId, existing.id(), request.contextKey(), claim);
        }

        repository.insertPaymentClaim(existing.id(), whatsappInstanceId, request, PaymentClaimStatus.REJECTED);
        return rejectedForExisting(request.tenantId(), existing, PaymentDecisionReason.ALREADY_USED);
    }

    private PaymentDecisionResponse registerSmsConfirmationOnce(SmsPaymentConfirmationRequest request) {
        ParsedPaymentRequest confirmation = request.parsedPayment();
        PaymentDecisionResponse invalid = validateParsedPayment(
                request.tenantId(),
                confirmation,
                TransactionSource.TASKER_SMS
        );
        if (invalid != null) {
            return invalid;
        }

        if (request.provider() != confirmation.provider()
                || !request.externalTransactionId().equals(confirmation.externalTransactionId())
                || !sameAmount(request.amount(), confirmation.amount())) {
            return PaymentDecisionResponse.rejected(
                    request.tenantId(),
                    null,
                    null,
                    request.externalTransactionId(),
                    request.amount(),
                    confirmation.destinationNumber(),
                    PaymentDecisionReason.NOT_FOUND
            );
        }

        if (!repository.activeAutomationDeviceExists(request.tenantId(), request.deviceId())) {
            return PaymentDecisionResponse.rejected(
                    request.tenantId(),
                    null,
                    null,
                    confirmation.externalTransactionId(),
                    confirmation.amount(),
                    confirmation.destinationNumber(),
                    PaymentDecisionReason.DEVICE_NOT_AUTHORIZED
            );
        }

        Optional<PaymentRecord> existing =
                repository.findPayment(request.tenantId(), confirmation.provider(), confirmation.externalTransactionId());
        if (existing.isPresent()) {
            return resolveExistingPaymentForConfirmation(request, confirmation, existing.get());
        }

        UUID paymentId = repository.insertOrphanPayment(request.tenantId(), confirmation);
        repository.insertPaymentConfirmation(paymentId, request, PaymentConfirmationStatus.ORPHAN);
        return PaymentDecisionResponse.orphanAccepted(request.tenantId(), paymentId, confirmation);
    }

    private PaymentDecisionResponse resolveExistingPaymentForConfirmation(
            SmsPaymentConfirmationRequest request,
            ParsedPaymentRequest confirmation,
            PaymentRecord existing
    ) {
        if (existing.status() == PaymentStatus.CLAIMED) {
            if (!sameAmount(existing.amount(), confirmation.amount())) {
                repository.insertPaymentConfirmation(existing.id(), request, PaymentConfirmationStatus.REJECTED);
                return rejectedForExisting(request.tenantId(), existing, PaymentDecisionReason.AMOUNT_MISMATCH);
            }

            String destinationNumber = existing.destinationNumber() != null
                    ? existing.destinationNumber()
                    : confirmation.counterpartyPhone();
            repository.markPaymentAndOrderVerified(existing.id(), existing.orderId(), destinationNumber);
            repository.insertPaymentConfirmation(existing.id(), request, PaymentConfirmationStatus.MATCHED);
            return PaymentDecisionResponse.verified(
                    request.tenantId(),
                    existing.orderId(),
                    existing.id(),
                    existing.contextKey(),
                    new ParsedPaymentRequest(
                            confirmation.matched(),
                            confirmation.provider(),
                            confirmation.type(),
                            confirmation.externalTransactionId(),
                            confirmation.amount(),
                            confirmation.fee(),
                            confirmation.counterpartyPhone(),
                            confirmation.counterpartyName(),
                            destinationNumber,
                            confirmation.balanceAfter(),
                            confirmation.occurredAt(),
                            confirmation.warnings(),
                            confirmation.parserVersion(),
                            confirmation.source()
                    )
            );
        }

        repository.insertPaymentConfirmation(existing.id(), request, PaymentConfirmationStatus.REJECTED);
        return rejectedForExisting(request.tenantId(), existing, PaymentDecisionReason.ALREADY_USED);
    }

    private PaymentDecisionResponse validateParsedPayment(
            String tenantId,
            ParsedPaymentRequest payment,
            TransactionSource expectedSource
    ) {
        if (payment.source() != expectedSource) {
            return PaymentDecisionResponse.rejected(
                    tenantId,
                    null,
                    null,
                    payment.externalTransactionId(),
                    payment.amount(),
                    payment.destinationNumber(),
                    PaymentDecisionReason.INVALID_SOURCE
            );
        }

        if (!Boolean.TRUE.equals(payment.matched())
                || payment.externalTransactionId() == null
                || payment.externalTransactionId().isBlank()
                || payment.amount() == null) {
            return PaymentDecisionResponse.rejected(
                    tenantId,
                    null,
                    null,
                    payment.externalTransactionId(),
                    payment.amount(),
                    payment.destinationNumber(),
                    PaymentDecisionReason.NOT_FOUND
            );
        }

        if (payment.type() != TransactionType.RECEIVED) {
            return PaymentDecisionResponse.rejected(
                    tenantId,
                    null,
                    null,
                    payment.externalTransactionId(),
                    payment.amount(),
                    payment.destinationNumber(),
                    PaymentDecisionReason.INVALID_TRANSACTION_TYPE
            );
        }

        return null;
    }

    private PaymentDecisionResponse rejectedForExisting(
            String tenantId,
            PaymentRecord payment,
            PaymentDecisionReason reason
    ) {
        return PaymentDecisionResponse.rejected(
                tenantId,
                payment.orderId(),
                payment.id(),
                payment.externalTransactionId(),
                payment.amount(),
                payment.destinationNumber(),
                reason
        );
    }

    private boolean sameAmount(BigDecimal left, BigDecimal right) {
        return left != null && right != null && left.compareTo(right) == 0;
    }
}
