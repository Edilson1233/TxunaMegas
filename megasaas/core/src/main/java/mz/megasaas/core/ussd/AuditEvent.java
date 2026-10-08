package mz.megasaas.core.ussd;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

record AuditEvent(
        String tenantId,
        String actorType,
        String actorId,
        String eventType,
        String resourceType,
        UUID resourceId,
        Map<String, Object> metadata,
        OffsetDateTime occurredAt
) {
}
