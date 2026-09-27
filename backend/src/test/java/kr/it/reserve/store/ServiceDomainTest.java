package kr.it.reserve.store;

import kr.it.reserve.store.entity.ServiceDomain;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ServiceDomainTest {

    @Test
    void infersLegacyCategoriesWithoutUsingBookingType() {
        Store store = Store.builder()
                .category("모던 필라테스")
                .bookingType(Store.BookingType.DAY)
                .build();

        assertThat(store.resolveServiceDomain()).isEqualTo(ServiceDomain.SPORTS);
    }

    @Test
    void explicitDomainAlwaysWinsOverLegacyCategory() {
        Store store = Store.builder()
                .category("카페")
                .serviceDomain(ServiceDomain.POPUP)
                .build();

        assertThat(store.resolveServiceDomain()).isEqualTo(ServiceDomain.POPUP);
    }

    @Test
    void parsesCaseInsensitivelyAndRejectsUnknownFilterValue() {
        assertThat(ServiceDomain.parseOrNull(" beauty_clinic "))
                .isEqualTo(ServiceDomain.BEAUTY_CLINIC);
        assertThat(ServiceDomain.parseOrNull("unknown")).isNull();
    }
}
