package mz.megasaas.core.payment;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

public record PaymentDecisionResponse(
        PaymentDecision decision,
        PaymentDecisionReason reason,
        String tenantId,
        UUID orderId,
        UUID paymentId,
        String contextKey,
        String externalTransactionId,
        BigDecimal amount,
        String destinationNumber,
        Integer deliveryAmount,
        Object ussdCommand,
        OffsetDateTime checkedAt
) {
    static PaymentDecisionResponse pending(
            String tenantId,
            UUID orderId,
            UUID paymentId,
            String contextKey,
            ParsedPaymentRequest payment,
            ProductPackagePrice productPackagePrice
    ) {
        return new PaymentDecisionResponse(
                PaymentDecision.PENDING_VERIFICATION,
                null,
                tenantId,
                orderId,
                paymentId,
                contextKey,
                payment.externalTransactionId(),
                payment.amount(),
                payment.destinationNumber(),
                deliveryAmount(productPackagePrice),
                null,
                OffsetDateTime.now()
        );
    }

    static PaymentDecisionResponse verified(
            String tenantId,
            UUID orderId,
            UUID paymentId,
            String contextKey,
            ParsedPaymentRequest payment,
            ProductPackagePrice productPackagePrice
    ) {
        return new PaymentDecisionResponse(
                PaymentDecision.VERIFIED,
                null,
                tenantId,
                orderId,
                paymentId,
                contextKey,
                payment.externalTransactionId(),
                payment.amount(),
                payment.destinationNumber(),
                deliveryAmount(productPackagePrice),
                null,
                OffsetDateTime.now()
        );
    }

    static PaymentDecisionResponse orphanAccepted(
            String tenantId,
            UUID paymentId,
            ParsedPaymentRequest payment,
            ProductPackagePrice productPackagePrice
    ) {
        return new PaymentDecisionResponse(
                PaymentDecision.ORPHAN_CONFIRMATION_ACCEPTED,
                null,
                tenantId,
                null,
                paymentId,
                null,
                payment.externalTransactionId(),
                payment.amount(),
                payment.destinationNumber(),
                deliveryAmount(productPackagePrice),
                null,
                OffsetDateTime.now()
        );
    }

    static PaymentDecisionResponse rejected(
            String tenantId,
            UUID orderId,
            UUID paymentId,
            String externalTransactionId,
            BigDecimal amount,
            String destinationNumber,
            PaymentDecisionReason reason
    ) {
        return new PaymentDecisionResponse(
                PaymentDecision.REJECTED,
                reason,
                tenantId,
                orderId,
                paymentId,
                null,
                externalTransactionId,
                amount,
                destinationNumber,
                null,
                null,
                OffsetDateTime.now()
        );
    }

    private static Integer deliveryAmount(ProductPackagePrice productPackagePrice) {
        return productPackagePrice != null ? productPackagePrice.allowanceMb() : null;
    }
}
