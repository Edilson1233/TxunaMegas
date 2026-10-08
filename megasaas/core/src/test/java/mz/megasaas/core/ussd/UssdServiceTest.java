package mz.megasaas.core.ussd;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import mz.megasaas.core.api.ConflictException;
import org.junit.jupiter.api.Test;

class UssdServiceTest {

    private static final String TENANT_ID = "11111111-1111-1111-1111-111111111111";
    private static final String DEVICE_ID = "22222222-2222-2222-2222-222222222222";
    private static final UUID ORDER_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    private static final UUID PAYMENT_ID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");

    private final FakeUssdRepository repository = new FakeUssdRepository();
    private final UssdService service = new UssdService(repository);

    @Test
    void registerCommandPersistsPendingCommandAndAuditEvent() {
        UssdCommandResponse response = service.registerCommand(validCreateRequest(), "cmd-key-1");

        assertThat(response.status()).isEqualTo(UssdCommandStatus.PENDING);
        assertThat(response.orderId()).isEqualTo(ORDER_ID);
        assertThat(repository.auditEvents).hasSize(1);
        assertThat(repository.auditEvents.get(0).eventType()).isEqualTo("USSD_COMMAND_CREATED");
        assertThat(repository.idempotency).containsKey("ussd-command-create:cmd-key-1");
    }

    @Test
    void registerCommandRejectsInactiveDevice() {
        repository.activeDevice = false;

        assertThatThrownBy(() -> service.registerCommand(validCreateRequest(), "cmd-key-2"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Automation device");
    }

    @Test
    void registerCommandRejectsDuplicateActiveCommand() {
        service.registerCommand(validCreateRequest(), "cmd-key-3");

        assertThatThrownBy(() -> service.registerCommand(validCreateRequest(), "cmd-key-4"))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void acknowledgeCommandCompletesOrderAndPaymentAndAuditsResult() {
        UssdCommandResponse created = service.registerCommand(validCreateRequest(), "cmd-key-5");

        UssdCommandResponse response = service.acknowledgeCommand(
                created.commandId(),
                new UssdCommandAckRequest(true, OffsetDateTime.now(), "MPESA-1", "ok", null)
        );

        assertThat(response.status()).isEqualTo(UssdCommandStatus.COMPLETED);
        assertThat(repository.completedOrders).contains(ORDER_ID);
        assertThat(repository.usedPayments).contains(PAYMENT_ID);
        assertThat(repository.auditEvents.get(1).eventType()).isEqualTo("USSD_COMMAND_COMPLETED");
    }

    private UssdCommandCreateRequest validCreateRequest() {
        return new UssdCommandCreateRequest(
                TENANT_ID,
                DEVICE_ID,
                ORDER_ID,
                PAYMENT_ID,
                "TX1",
                "850108639",
                new BigDecimal("600")
        );
    }

    private static final class FakeUssdRepository implements UssdRepository {
        private final Map<UUID, UssdCommandRecord> commands = new HashMap<>();
        private final Map<String, UssdCommandResponse> idempotency = new HashMap<>();
        private final List<AuditEvent> auditEvents = new ArrayList<>();
        private final List<UUID> completedOrders = new ArrayList<>();
        private final List<UUID> failedOrders = new ArrayList<>();
        private final List<UUID> usedPayments = new ArrayList<>();
        private boolean activeDevice = true;

        @Override
        public Optional<UssdCommandResponse> findIdempotentResponse(String tenantId, String idempotencyKey, String operation) {
            return Optional.ofNullable(idempotency.get(operation + ":" + idempotencyKey));
        }

        @Override
        public void saveIdempotentResponse(String tenantId, String idempotencyKey, String operation, UssdCommandResponse response) {
            idempotency.put(operation + ":" + idempotencyKey, response);
        }

        @Override
        public boolean activeAutomationDeviceExists(String tenantId, String deviceId) {
            return activeDevice && TENANT_ID.equals(tenantId) && DEVICE_ID.equals(deviceId);
        }

        @Override
        public boolean orderPaymentPairExists(String tenantId, UUID orderId, UUID paymentId) {
            return TENANT_ID.equals(tenantId) && ORDER_ID.equals(orderId) && PAYMENT_ID.equals(paymentId);
        }

        @Override
        public Optional<UssdCommandRecord> findActiveByOrderPayment(String tenantId, UUID orderId, UUID paymentId) {
            return commands.values().stream()
                    .filter(command -> command.tenantId().equals(tenantId))
                    .filter(command -> command.orderId().equals(orderId))
                    .filter(command -> command.paymentId().equals(paymentId))
                    .filter(command -> command.status() == UssdCommandStatus.PENDING
                            || command.status() == UssdCommandStatus.DISPATCHED)
                    .findFirst();
        }

        @Override
        public Optional<UssdCommandRecord> findById(UUID commandId) {
            return Optional.ofNullable(commands.get(commandId));
        }

        @Override
        public UssdCommandRecord insert(UssdCommandCreateRequest request) {
            UUID commandId = UUID.randomUUID();
            UssdCommandRecord record = new UssdCommandRecord(
                    commandId,
                    request.tenantId(),
                    request.orderId(),
                    request.paymentId(),
                    request.deviceId(),
                    request.externalTransactionId(),
                    UssdCommandStatus.PENDING,
                    OffsetDateTime.now()
            );
            commands.put(commandId, record);
            return record;
        }

        @Override
        public UssdCommandRecord updateAck(UUID commandId, UssdCommandStatus status, String lastError) {
            UssdCommandRecord existing = commands.get(commandId);
            UssdCommandRecord updated = new UssdCommandRecord(
                    existing.commandId(),
                    existing.tenantId(),
                    existing.orderId(),
                    existing.paymentId(),
                    existing.deviceId(),
                    existing.externalTransactionId(),
                    status,
                    existing.createdAt()
            );
            commands.put(commandId, updated);
            return updated;
        }

        @Override
        public void markOrderCompleted(UUID orderId) {
            completedOrders.add(orderId);
        }

        @Override
        public void markOrderFailed(UUID orderId) {
            failedOrders.add(orderId);
        }

        @Override
        public void markPaymentUsed(UUID paymentId) {
            usedPayments.add(paymentId);
        }

        @Override
        public void insertAuditEvent(AuditEvent event) {
            auditEvents.add(event);
        }
    }
}
