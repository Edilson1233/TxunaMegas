package mz.megasaas.core.payment;

import java.math.BigDecimal;
import java.util.UUID;

record ProductPackagePrice(
        UUID packageId,
        Integer allowanceMb,
        BigDecimal amount
) {
}
