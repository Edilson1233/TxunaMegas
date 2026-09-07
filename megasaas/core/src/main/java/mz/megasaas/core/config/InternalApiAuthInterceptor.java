package mz.megasaas.core.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class InternalApiAuthInterceptor implements HandlerInterceptor {

    private static final String BEARER_PREFIX = "Bearer ";

    private final InternalApiProperties properties;

    public InternalApiAuthInterceptor(InternalApiProperties properties) {
        this.properties = properties;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        String expectedToken = properties.internalApiToken();
        String authorization = request.getHeader(HttpHeaders.AUTHORIZATION);

        if (expectedToken == null || expectedToken.isBlank() || !matchesBearerToken(authorization, expectedToken)) {
            response.setStatus(HttpStatus.UNAUTHORIZED.value());
            response.setContentType("application/json");
            response.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"Invalid internal API token\"}");
            return false;
        }

        return true;
    }

    private boolean matchesBearerToken(String authorization, String expectedToken) {
        if (authorization == null || !authorization.startsWith(BEARER_PREFIX)) {
            return false;
        }

        String providedToken = authorization.substring(BEARER_PREFIX.length()).trim();
        byte[] provided = providedToken.getBytes(StandardCharsets.UTF_8);
        byte[] expected = expectedToken.trim().getBytes(StandardCharsets.UTF_8);
        return MessageDigest.isEqual(provided, expected);
    }
}
