package mz.megasaas.core;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest(properties = {
        "spring.flyway.enabled=false",
        "spring.datasource.url=jdbc:h2:mem:megasaas_core_test;MODE=PostgreSQL",
        "spring.datasource.username=sa",
        "spring.datasource.password=",
        "megasaas.core.internal-api-token=test-token"
})
class CoreApplicationTests {

    @Test
    void contextLoads() {
    }
}
