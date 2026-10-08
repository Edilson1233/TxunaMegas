package mz.megasaas.core.ussd;

import jakarta.validation.constraints.NotNull;
import java.time.OffsetDateTime;

public record UssdCommandAckRequest(
        @NotNull Boolean success,
        @NotNull OffsetDateTime acknowledgedAt,
        String providerReference,
        String details,
        String rawOutput
) {
}
