package kr.it.reserve.reservation;

import kr.it.reserve.global.admission.ServiceAdmissionRoutes;
import kr.it.reserve.global.admission.ServiceAdmissionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ReservationEditAuthorizationTest {
    @Autowired MockMvc mvc;

    @ParameterizedTest
    @ValueSource(strings = {"/api", "/api/v1"})
    void anAdmissionPreservedEditContextStillRequiresAuthentication(String prefix) throws Exception {
        mvc.perform(get(prefix + "/reservations/23/edit-store").param("storeId", "10"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(prefix + "/reservations/23/availability").param("storeId", "10").param("date", "2030-01-10"))
                .andExpect(status().isUnauthorized());
        mvc.perform(get(prefix + "/reservations/23/calendar").param("storeId", "10").param("month", "2030-01"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void emergencyPreservesOnlyTheExistingReservationContextWhilePublicDiscoveryRemainsGated() {
        for (String path : new String[]{"/api/reservations/23/edit-store", "/api/reservations/23/availability", "/api/reservations/23/calendar"}) {
            assertThat(ServiceAdmissionRoutes.protectedBy(ServiceAdmissionService.Mode.EMERGENCY, "GET", path)).isFalse();
        }
        for (String path : new String[]{"/api/stores/10", "/api/reservations/availability", "/api/reservations/calendar"}) {
            assertThat(ServiceAdmissionRoutes.protectedBy(ServiceAdmissionService.Mode.EMERGENCY, "GET", path)).isTrue();
        }
    }
}
