package mz.megasaas.core.payment;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
class JdbcPaymentRepository implements PaymentRepository {

    private final JdbcClient jdbcClient;
    private final ObjectMapper objectMapper;

    JdbcPaymentRepository(JdbcClient jdbcClient, ObjectMapper objectMapper) {
        this.jdbcClient = jdbcClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public Optional<PaymentDecisionResponse> findIdempotentPaymentDecision(
            String tenantId,
            String idempotencyKey,
            String operation
    ) {
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
                .map(this::readPaymentDecision);
    }

    @Override
    public void saveIdempotentPaymentDecision(
            String tenantId,
            String idempotencyKey,
            String operation,
            PaymentDecisionResponse response
    ) {
        jdbcClient.sql("""
                        insert into idempotency_keys (
                            id, tenant_id, idempotency_key, operation, request_hash,
                            response_status, response_body, expires_at
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), :idempotencyKey, :operation, null,
                            200, cast(:responseBody as jsonb), now() + interval '24 hours'
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
    public Optional<UUID> findWhatsappInstanceId(String tenantId, String instanceId) {
        return jdbcClient.sql("""
                        select id
                        from whatsapp_instances
                        where tenant_id = cast(:tenantId as uuid)
                          and instance_id = :instanceId
                          and status <> 'DISABLED'
                        """)
                .param("tenantId", tenantId)
                .param("instanceId", instanceId)
                .query(UUID.class)
                .optional();
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
    public Optional<PaymentRecord> findPayment(String tenantId, PaymentProvider provider, String externalTransactionId) {
        return jdbcClient.sql("""
                        select p.id, p.order_id, o.context_key, p.provider, p.external_transaction_id,
                               p.transaction_type, p.amount, p.destination_number, p.status
                        from payments p
                        left join orders o on o.id = p.order_id
                        where p.tenant_id = cast(:tenantId as uuid)
                          and p.provider = :provider
                          and p.external_transaction_id = :externalTransactionId
                        """)
                .param("tenantId", tenantId)
                .param("provider", provider.name())
                .param("externalTransactionId", externalTransactionId)
                .query((rs, rowNum) -> new PaymentRecord(
                        rs.getObject("id", UUID.class),
                        rs.getObject("order_id", UUID.class),
                        rs.getString("context_key"),
                        PaymentProvider.valueOf(rs.getString("provider")),
                        rs.getString("external_transaction_id"),
                        TransactionType.valueOf(rs.getString("transaction_type")),
                        rs.getBigDecimal("amount"),
                        rs.getString("destination_number"),
                        PaymentStatus.valueOf(rs.getString("status"))
                ))
                .optional();
    }

    @Override
    public UUID insertOrderForClaim(PaymentClaimRequest request, OrderStatus status) {
        UUID id = UUID.randomUUID();
        jdbcClient.sql("""
                        insert into orders (
                            id, tenant_id, context_key, destination_number, amount_expected, status
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), :contextKey,
                            :destinationNumber, :amountExpected, :status
                        )
                        """)
                .param("id", id.toString())
                .param("tenantId", request.tenantId())
                .param("contextKey", request.contextKey())
                .param("destinationNumber", request.parsedPayment().destinationNumber())
                .param("amountExpected", request.parsedPayment().amount())
                .param("status", status.name())
                .update();
        return id;
    }

    @Override
    public UUID insertClaimedPayment(String tenantId, UUID orderId, ParsedPaymentRequest payment, PaymentStatus status) {
        UUID id = UUID.randomUUID();
        jdbcClient.sql("""
                        insert into payments (
                            id, tenant_id, order_id, provider, external_transaction_id, transaction_type,
                            amount, fee, counterparty_phone, counterparty_name, destination_number,
                            balance_after, occurred_at, status
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), cast(:orderId as uuid), :provider,
                            :externalTransactionId, :transactionType, :amount, :fee, :counterpartyPhone,
                            :counterpartyName, :destinationNumber, :balanceAfter, :occurredAt, :status
                        )
                        """)
                .param("id", id.toString())
                .param("tenantId", tenantId)
                .param("orderId", orderId.toString())
                .param("provider", payment.provider().name())
                .param("externalTransactionId", payment.externalTransactionId())
                .param("transactionType", payment.type().name())
                .param("amount", payment.amount())
                .param("fee", payment.fee())
                .param("counterpartyPhone", payment.counterpartyPhone())
                .param("counterpartyName", payment.counterpartyName())
                .param("destinationNumber", payment.destinationNumber())
                .param("balanceAfter", payment.balanceAfter())
                .param("occurredAt", payment.occurredAt())
                .param("status", status.name())
                .update();
        return id;
    }

    @Override
    public void insertPaymentClaim(
            UUID paymentId,
            UUID whatsappInstanceId,
            PaymentClaimRequest request,
            PaymentClaimStatus status
    ) {
        jdbcClient.sql("""
                        insert into payment_claims (
                            id, tenant_id, payment_id, whatsapp_instance_id, context_key, chat_type,
                            chat_id, user_id, message_id, raw_message_text, claimed_at, status
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), cast(:paymentId as uuid),
                            cast(:whatsappInstanceId as uuid), :contextKey, :chatType, :chatId,
                            :userId, :messageId, :rawMessageText, :claimedAt, :status
                        )
                        """)
                .param("id", UUID.randomUUID().toString())
                .param("tenantId", request.tenantId())
                .param("paymentId", paymentId.toString())
                .param("whatsappInstanceId", whatsappInstanceId.toString())
                .param("contextKey", request.contextKey())
                .param("chatType", request.chatType().name())
                .param("chatId", request.chatId())
                .param("userId", request.userId())
                .param("messageId", request.messageId())
                .param("rawMessageText", request.rawMessageText())
                .param("claimedAt", request.receivedAt())
                .param("status", status.name())
                .update();
    }

    @Override
    public UUID insertOrphanPayment(String tenantId, ParsedPaymentRequest payment) {
        UUID id = UUID.randomUUID();
        jdbcClient.sql("""
                        insert into payments (
                            id, tenant_id, provider, external_transaction_id, transaction_type,
                            amount, fee, counterparty_phone, counterparty_name, destination_number,
                            balance_after, occurred_at, status
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), :provider, :externalTransactionId,
                            :transactionType, :amount, :fee, :counterpartyPhone, :counterpartyName,
                            :destinationNumber, :balanceAfter, :occurredAt, 'ORPHAN'
                        )
                        """)
                .param("id", id.toString())
                .param("tenantId", tenantId)
                .param("provider", payment.provider().name())
                .param("externalTransactionId", payment.externalTransactionId())
                .param("transactionType", payment.type().name())
                .param("amount", payment.amount())
                .param("fee", payment.fee())
                .param("counterpartyPhone", payment.counterpartyPhone())
                .param("counterpartyName", payment.counterpartyName())
                .param("destinationNumber", payment.destinationNumber())
                .param("balanceAfter", payment.balanceAfter())
                .param("occurredAt", payment.occurredAt())
                .update();
        return id;
    }

    @Override
    public void insertPaymentConfirmation(
            UUID paymentId,
            SmsPaymentConfirmationRequest request,
            PaymentConfirmationStatus status
    ) {
        jdbcClient.sql("""
                        insert into payment_confirmations (
                            id, tenant_id, payment_id, device_id, external_transaction_id,
                            raw_sms, reported_at, parser_version, status
                        )
                        values (
                            cast(:id as uuid), cast(:tenantId as uuid), cast(:paymentId as uuid),
                            cast(:deviceId as uuid), :externalTransactionId, :rawSms, :reportedAt,
                            :parserVersion, :status
                        )
                        """)
                .param("id", UUID.randomUUID().toString())
                .param("tenantId", request.tenantId())
                .param("paymentId", paymentId.toString())
                .param("deviceId", request.deviceId())
                .param("externalTransactionId", request.externalTransactionId())
                .param("rawSms", request.rawSms())
                .param("reportedAt", request.reportedAt())
                .param("parserVersion", request.parsedPayment().parserVersion())
                .param("status", status.name())
                .update();
    }

    @Override
    public void markPaymentAndOrderVerified(UUID paymentId, UUID orderId, String destinationNumber) {
        jdbcClient.sql("""
                        update payments
                        set status = 'CONFIRMED',
                            destination_number = coalesce(:destinationNumber, destination_number),
                            updated_at = now()
                        where id = cast(:paymentId as uuid)
                        """)
                .param("paymentId", paymentId.toString())
                .param("destinationNumber", destinationNumber)
                .update();

        if (orderId != null) {
            jdbcClient.sql("""
                            update orders
                            set status = 'PAYMENT_VERIFIED',
                                destination_number = coalesce(:destinationNumber, destination_number),
                                updated_at = now()
                            where id = cast(:orderId as uuid)
                            """)
                    .param("orderId", orderId.toString())
                    .param("destinationNumber", destinationNumber)
                    .update();
        }
    }

    private PaymentDecisionResponse readPaymentDecision(String json) {
        try {
            return objectMapper.readValue(json, PaymentDecisionResponse.class);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Stored idempotency response is invalid", ex);
        }
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Cannot serialize idempotency response", ex);
        }
    }
}
