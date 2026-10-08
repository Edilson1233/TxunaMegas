package mz.megasaas.core.ussd;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcUssdRepository implements UssdRepository {

    private final JdbcClient jdbcClient;
    private final ObjectMapper objectMapper;

    JdbcUssdRepository(JdbcClient jdbcClient, ObjectMapper objectMapper) {
        this.jdbcClient = jdbcClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public Optional<UssdCommandResponse> findIdempotentResponse(String tenantId, String idempotencyKey, String operation) {
        return jdbcClient.sql("""
                        select response_body::text
                        from idempotency_keys
                        where tenant_id = cast(:tenantId as uuid)
                          and idempotency_key = :idempotencyKey
                          and operation = :operation
                        """)
                .param("tenantId", tenantId)
                .param("idempotencyKey", idempotencyKey)
                .param("operation", operation)
                .query(String.class)
                .optional()
                .map(this::readResponse);
    }

    @Override
    public void saveIdempotentResponse(String tenantId, String idempotencyKey, String operation, UssdCommandResponse response) {
        jdbcClient.sql("""
                        insert into idempotency_keys (
                            id, tenant_id, idempotency_key, operation, request_hash,
                            response_status, response_body, expires_at
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), :idempotencyKey, :operation, null,
                            201, cast(:responseBody as jsonb), now() + interval '24 hours'
                        )
                        on conflict (tenant_id, idempotency_key, operation) do nothing
                        """)
                .param("id", UUID.randomUUID().toString())
                .param("tenantId", tenantId)
                .param("idempotencyKey", idempotencyKey)
                .param("operation", operation)
                .param("responseBody", writeJson(response))
                .update();
    }

    @Override
    public boolean activeAutomationDeviceExists(String tenantId, String deviceId) {
        return jdbcClient.sql("""
                        select count(*)
                        from automation_devices
                        where tenant_id = cast(:tenantId as uuid)
                          and id = cast(:deviceId as uuid)
                          and status = 'ACTIVE'
                        """)
                .param("tenantId", tenantId)
                .param("deviceId", deviceId)
                .query(Integer.class)
                .single() > 0;
    }

    @Override
    public boolean orderPaymentPairExists(String tenantId, UUID orderId, UUID paymentId) {
        return jdbcClient.sql("""
                        select count(*)
                        from orders o
                        join payments p on p.order_id = o.id
                        where o.tenant_id = cast(:tenantId as uuid)
                          and p.tenant_id = cast(:tenantId as uuid)
                          and o.id = cast(:orderId as uuid)
                          and p.id = cast(:paymentId as uuid)
                        """)
                .param("tenantId", tenantId)
                .param("orderId", orderId.toString())
                .param("paymentId", paymentId.toString())
                .query(Integer.class)
                .single() > 0;
    }

    @Override
    public Optional<UssdCommandRecord> findActiveByOrderPayment(String tenantId, UUID orderId, UUID paymentId) {
        return jdbcClient.sql("""
                        select id, tenant_id, order_id, payment_id, device_id, status, created_at
                        from ussd_commands
                        where tenant_id = cast(:tenantId as uuid)
                          and order_id = cast(:orderId as uuid)
                          and payment_id = cast(:paymentId as uuid)
                          and status in ('PENDING', 'DISPATCHED')
                        order by created_at desc
                        limit 1
                        """)
                .param("tenantId", tenantId)
                .param("orderId", orderId.toString())
                .param("paymentId", paymentId.toString())
                .query(this::mapRecord)
                .optional();
    }

    @Override
    public Optional<UssdCommandRecord> findById(UUID commandId) {
        return jdbcClient.sql("""
                        select uc.id, uc.tenant_id, uc.order_id, uc.payment_id, uc.device_id,
                               uc.status, uc.created_at, p.external_transaction_id
                        from ussd_commands uc
                        join payments p on p.id = uc.payment_id
                        where uc.id = cast(:commandId as uuid)
                        """)
                .param("commandId", commandId.toString())
                .query(this::mapRecord)
                .optional();
    }

    @Override
    public UssdCommandRecord insert(UssdCommandCreateRequest request) {
        UUID commandId = UUID.randomUUID();
        jdbcClient.sql("""
                        insert into ussd_commands (
                            id, tenant_id, order_id, payment_id, device_id,
                            destination_number, amount, status, attempt_count
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), cast(:orderId as uuid),
                            cast(:paymentId as uuid), cast(:deviceId as uuid),
                            :destinationNumber, :amount, 'PENDING', 0
                        )
                        """)
                .param("id", commandId.toString())
                .param("tenantId", request.tenantId())
                .param("orderId", request.orderId().toString())
                .param("paymentId", request.paymentId().toString())
                .param("deviceId", request.deviceId())
                .param("destinationNumber", request.destinationNumber())
                .param("amount", request.amount())
                .update();
        return findById(commandId).orElseThrow();
    }

    @Override
    public UssdCommandRecord updateAck(UUID commandId, UssdCommandStatus status, String lastError) {
        jdbcClient.sql("""
                        update ussd_commands
                        set status = :status,
                            last_error = :lastError,
                            acknowledged_at = now(),
                            updated_at = now()
                        where id = cast(:commandId as uuid)
                        """)
                .param("commandId", commandId.toString())
                .param("status", status.name())
                .param("lastError", lastError)
                .update();
        return findById(commandId).orElseThrow();
    }

    @Override
    public void markOrderCompleted(UUID orderId) {
        jdbcClient.sql("""
                        update orders
                        set status = 'COMPLETED',
                            updated_at = now()
                        where id = cast(:orderId as uuid)
                        """)
                .param("orderId", orderId.toString())
                .update();
    }

    @Override
    public void markOrderFailed(UUID orderId) {
        jdbcClient.sql("""
                        update orders
                        set status = 'FAILED',
                            updated_at = now()
                        where id = cast(:orderId as uuid)
                        """)
                .param("orderId", orderId.toString())
                .update();
    }

    @Override
    public void markPaymentUsed(UUID paymentId) {
        jdbcClient.sql("""
                        update payments
                        set status = 'USED',
                            updated_at = now()
                        where id = cast(:paymentId as uuid)
                        """)
                .param("paymentId", paymentId.toString())
                .update();
    }

    @Override
    public void insertAuditEvent(AuditEvent event) {
        jdbcClient.sql("""
                        insert into audit_events (
                            id, tenant_id, actor_type, actor_id, event_type,
                            resource_type, resource_id, metadata, occurred_at
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), :actorType, :actorId,
                            :eventType, :resourceType, :resourceId, cast(:metadata as jsonb), :occurredAt
                        )
                        """)
                .param("id", UUID.randomUUID().toString())
                .param("tenantId", event.tenantId())
                .param("actorType", event.actorType())
                .param("actorId", event.actorId())
                .param("eventType", event.eventType())
                .param("resourceType", event.resourceType())
                .param("resourceId", event.resourceId().toString())
                .param("metadata", writeJson(event.metadata() != null ? event.metadata() : Map.of()))
                .param("occurredAt", event.occurredAt())
                .update();
    }

    private UssdCommandRecord mapRecord(java.sql.ResultSet rs, int rowNum) throws java.sql.SQLException {
        return new UssdCommandRecord(
                rs.getObject("id", UUID.class),
                rs.getObject("tenant_id", UUID.class).toString(),
                rs.getObject("order_id", UUID.class),
                rs.getObject("payment_id", UUID.class),
                rs.getObject("device_id", UUID.class).toString(),
                readNullableString(rs, "external_transaction_id"),
                UssdCommandStatus.valueOf(rs.getString("status")),
                rs.getObject("created_at", java.time.OffsetDateTime.class)
        );
    }

    private String readNullableString(java.sql.ResultSet rs, String column) {
        try {
            return rs.getString(column);
        } catch (java.sql.SQLException ex) {
            return null;
        }
    }

    private UssdCommandResponse readResponse(String json) {
        try {
            return objectMapper.readValue(json, UssdCommandResponse.class);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored idempotency response is invalid", ex);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Cannot serialize JSON value", ex);
        }
    }
}
