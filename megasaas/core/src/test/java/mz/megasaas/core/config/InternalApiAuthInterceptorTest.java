package mz.megasaas.core.config;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.servlet.http.HttpServletResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class InternalApiAuthInterceptorTest {

    private final InternalApiAuthInterceptor interceptor =
            new InternalApiAuthInterceptor(new InternalApiProperties("secret-token"));

    @Test
    void acceptsValidBearerToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer secret-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isTrue();
    }

    @Test
    void rejectsMissingBearerToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED);
    }

    @Test
    void rejectsWrongBearerToken() throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader(HttpHeaders.AUTHORIZATION, "Bearer wrong-token");
        MockHttpServletResponse response = new MockHttpServletResponse();

        boolean allowed = interceptor.preHandle(request, response, new Object());

        assertThat(allowed).isFalse();
        assertThat(response.getStatus()).isEqualTo(HttpServletResponse.SC_UNAUTHORIZED);
    }
}
