package mz.megasaas.core.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "megasaas.core")
public record InternalApiProperties(String internalApiToken) {
}
