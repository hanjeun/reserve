package kr.it.reserve.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.controller.ReservationEditApiController;
import kr.it.reserve.reservation.dto.CalendarDayResponse;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.reservation.service.ReservationEditQueryService;
import kr.it.reserve.store.dto.StoreResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ReservationEditApiControllerTest {
    private final ReservationEditQueryService queries = mock(ReservationEditQueryService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final Member member = Member.builder().id(7L).build();
    private MockMvc mvc;

    @BeforeEach
    void prepare() {
        mvc = standaloneSetup(new ReservationEditApiController(queries, limiter)).setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper().findAndRegisterModules())).build();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(member, null, List.of()));
        when(limiter.tryConsume("reservation-edit:7", RateLimiter.Policy.PROFILE_READ)).thenReturn(true);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void eachContextReadUsesTheSameMemberQuotaAndPreservesTheExistingPayloadShape() throws Exception {
        when(queries.getEditStore(23L, 10L, member)).thenReturn(StoreResponse.builder().id(10L).name("공개 가게").build());
        when(queries.getEditAvailability(23L, 10L, LocalDate.of(2030, 1, 10), member))
                .thenReturn(List.of(new SlotAvailabilityResponse("12:00", false)));
        when(queries.getEditCalendar(23L, 10L, YearMonth.of(2030, 1), member))
                .thenReturn(List.of(new CalendarDayResponse("2030-01-10", "FULL", 1, 0, false)));

        mvc.perform(get("/api/reservations/23/edit-store").param("storeId", "10").param("memberId", "999"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.id").value(10));
        mvc.perform(get("/api/reservations/23/availability").param("storeId", "10").param("date", "2030-01-10"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].available").value(false));
        mvc.perform(get("/api/reservations/23/calendar").param("storeId", "10").param("month", "2030-01"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data[0].status").value("FULL"));

        verify(limiter, times(3)).tryConsume("reservation-edit:7", RateLimiter.Policy.PROFILE_READ);
        verify(queries).getEditStore(23L, 10L, member);
        verify(queries).getEditAvailability(23L, 10L, LocalDate.of(2030, 1, 10), member);
        verify(queries).getEditCalendar(23L, 10L, YearMonth.of(2030, 1), member);
        verifyNoMoreInteractions(queries, limiter);
    }

    @Test
    void theSharedReadQuotaRejectsEveryEndpointBeforeAnyContextOrPublicRead() throws Exception {
        when(limiter.tryConsume("reservation-edit:7", RateLimiter.Policy.PROFILE_READ)).thenReturn(false);
        mvc.perform(get("/api/reservations/23/edit-store").param("storeId", "10")).andExpect(status().isTooManyRequests());
        mvc.perform(get("/api/reservations/23/availability").param("storeId", "10").param("date", "2030-01-10"))
                .andExpect(status().isTooManyRequests());
        mvc.perform(get("/api/reservations/23/calendar").param("storeId", "10").param("month", "2030-01"))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(queries);
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 403, 404, 500})
    void contextErrorsKeepTheirStatusWithoutAnUnguardedFallback(int responseStatus) throws Exception {
        when(queries.getEditStore(23L, 999L, member)).thenThrow(new ReservationException("예약 정보를 확인해주세요.", HttpStatus.valueOf(responseStatus)));
        mvc.perform(get("/api/reservations/23/edit-store").param("storeId", "999"))
                .andExpect(status().is(responseStatus)).andExpect(jsonPath("$.success").value(false));
        verify(queries).getEditStore(23L, 999L, member);
        verifyNoMoreInteractions(queries);
    }

    @Test
    void missingStoreAndMalformedDatesNeverStartAContextRead() throws Exception {
        mvc.perform(get("/api/reservations/23/edit-store")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/reservations/23/availability").param("storeId", "10").param("date", "invalid"))
                .andExpect(status().isBadRequest());
        mvc.perform(get("/api/reservations/23/calendar").param("storeId", "10").param("month", "2030-13"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(queries, limiter);
    }
}
