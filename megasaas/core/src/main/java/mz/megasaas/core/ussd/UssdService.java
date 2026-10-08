package mz.megasaas.core.ussd;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mz.megasaas.core.api.ConflictException;
import mz.megasaas.core.api.ResourceNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UssdService {

    private static final String CREATE_OPERATION = "ussd-command-create";

    private final UssdRepository repository;

    public UssdService(UssdRepository repository) {
        this.repository = repository;
    }

    @Transactional
    public UssdCommandResponse registerCommand(UssdCommandCreateRequest request, String idempotencyKey) {
        Optional<UssdCommandResponse> replay =
                repository.findIdempotentResponse(request.tenantId(), idempotencyKey, CREATE_OPERATION);
        if (replay.isPresent()) {
            return replay.get();
        }

        if (!repository.activeAutomationDeviceExists(request.tenantId(), request.deviceId())) {
            throw new IllegalArgumentException("Automation device is not active for tenant");
        }

        if (!repository.orderPaymentPairExists(request.tenantId(), request.orderId(), request.paymentId())) {
            throw new IllegalArgumentException("Order/payment pair does not belong to tenant");
        }

        repository.findActiveByOrderPayment(request.tenantId(), request.orderId(), request.paymentId())
                .ifPresent(command -> {
                    throw new ConflictException("Active USSD command already exists for order/payment");
                });

        UssdCommandRecord command = repository.insert(request);
        repository.insertAuditEvent(new AuditEvent(
                request.tenantId(),
                "DEVICE",
                request.deviceId(),
                "USSD_COMMAND_CREATED",
                "USSD_COMMAND",
                command.commandId(),
                Map.of(
                        "orderId", request.orderId().toString(),
                        "paymentId", request.paymentId().toString(),
                        "externalTransactionId", request.externalTransactionId(),
                        "destinationNumber", request.destinationNumber(),
                        "amount", request.amount()
                ),
                OffsetDateTime.now()
        ));

        UssdCommandResponse response = command.toResponse();
        repository.saveIdempotentResponse(request.tenantId(), idempotencyKey, CREATE_OPERATION, response);
        return response;
    }

    @Transactional
    public UssdCommandResponse acknowledgeCommand(UUID commandId, UssdCommandAckRequest request) {
        UssdCommandRecord existing = repository.findById(commandId)
                .orElseThrow(() -> new ResourceNotFoundException("USSD command not found"));

        if (existing.status() != UssdCommandStatus.PENDING && existing.status() != UssdCommandStatus.DISPATCHED) {
            throw new ConflictException("USSD command cannot be acknowledged from status " + existing.status());
        }

        boolean success = Boolean.TRUE.equals(request.success());
        UssdCommandStatus nextStatus = success ? UssdCommandStatus.COMPLETED : UssdCommandStatus.FAILED;
        UssdCommandRecord updated = repository.updateAck(commandId, nextStatus, request.details());

        if (success) {
            repository.markPaymentUsed(updated.paymentId());
            repository.markOrderCompleted(updated.orderId());
        } else {
            repository.markOrderFailed(updated.orderId());
        }

        repository.insertAuditEvent(new AuditEvent(
                updated.tenantId(),
                "DEVICE",
                updated.deviceId(),
                success ? "USSD_COMMAND_COMPLETED" : "USSD_COMMAND_FAILED",
                "USSD_COMMAND",
                updated.commandId(),
                Map.of(
                        "orderId", updated.orderId().toString(),
                        "paymentId", updated.paymentId().toString(),
                        "externalTransactionId", updated.externalTransactionId(),
                        "details", request.details() != null ? request.details() : "",
                        "providerReference", request.providerReference() != null ? request.providerReference() : ""
                ),
                request.acknowledgedAt()
        ));

        return updated.toResponse();
    }
}
