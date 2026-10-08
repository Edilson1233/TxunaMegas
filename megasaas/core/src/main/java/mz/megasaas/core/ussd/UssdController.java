package mz.megasaas.core.ussd;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/internal/v1/ussd-commands")
public class UssdController {

    private final UssdService ussdService;

    public UssdController(UssdService ussdService) {
        this.ussdService = ussdService;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UssdCommandResponse registerCommand(
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @Valid @RequestBody UssdCommandCreateRequest request
    ) {
        return ussdService.registerCommand(request, idempotencyKey);
    }

    @PostMapping("/{commandId}/ack")
    public UssdCommandResponse acknowledgeCommand(
            @PathVariable UUID commandId,
            @Valid @RequestBody UssdCommandAckRequest request
    ) {
        return ussdService.acknowledgeCommand(commandId, request);
    }
}
