package mz.megasaas.core.payment;

public enum PaymentDecision {
    PENDING_VERIFICATION,
    VERIFIED,
    REJECTED,
    ORPHAN_CONFIRMATION_ACCEPTED
}
