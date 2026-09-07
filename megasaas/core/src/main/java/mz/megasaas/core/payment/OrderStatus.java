package mz.megasaas.core.payment;

public enum OrderStatus {
    PENDING_PAYMENT,
    PAYMENT_VERIFIED,
    PROCESSING_USSD,
    COMPLETED,
    FAILED,
    CANCELLED,
    EXPIRED
}
