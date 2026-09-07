package mz.megasaas.core.payment;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    @PostMapping("/payment-claims")
    public PaymentDecisionResponse registerPaymentClaim(
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody PaymentClaimRequest request
    ) {
        return paymentService.registerClaim(request, idempotencyKey);
    }

    @PostMapping("/payment-confirmations/sms")
    public PaymentDecisionResponse registerSmsPaymentConfirmation(
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody SmsPaymentConfirmationRequest request
    ) {
        return paymentService.registerSmsConfirmation(request, idempotencyKey);
    }
}
