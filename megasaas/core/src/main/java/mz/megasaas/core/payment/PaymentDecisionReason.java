package mz.megasaas.core.payment;

public enum PaymentDecisionReason {
    NOT_FOUND,
    AMOUNT_MISMATCH,
    ALREADY_USED,
    INVALID_SOURCE,
    INVALID_TRANSACTION_TYPE,
    TENANT_DISABLED,
    DEVICE_NOT_AUTHORIZED
}
