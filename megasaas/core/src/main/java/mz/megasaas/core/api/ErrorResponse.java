package mz.megasaas.core.api;

public record ErrorResponse(String code, String message, String correlationId) {
}
