package kr.it.reserve.reservation.admission;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.controller.ReservationApiController;
import kr.it.reserve.reservation.dto.ReservationCreateRequest;
import kr.it.reserve.reservation.service.ReservationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ReservationRecoveryControllerTest {
    private final ReservationService service = mock(ReservationService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final Member member = Member.builder().id(1L).build();
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules().disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private MockMvc mvc;
    private ReservationCreateRequest request;

    @BeforeEach
    void prepare() {
        mvc = standaloneSetup(new ReservationApiController(service, limiter)).setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(mapper)).build();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(member, null, List.of()));
        request = new ReservationCreateRequest(10L, LocalDate.now().plusDays(2), LocalTime.NOON, 1, null, false);
        request.setRequestId("11111111-1111-4111-8111-111111111111");
        when(limiter.tryConsume(anyString(), eq(RateLimiter.Policy.PROFILE_READ))).thenReturn(true);
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
        verify(service, never()).createReservation(any(), any());
    }

    @Test
    void missingCommittedResultIsSuccessfulNullAndUsesTheMemberReadQuota() throws Exception {
        mvc.perform(post("/api/reservations/requests/result").contentType("application/json").content(mapper.writeValueAsString(request)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));
        verify(limiter).tryConsume("reservation-result:1", RateLimiter.Policy.PROFILE_READ);
        verify(service).recoverReservation(any(ReservationCreateRequest.class), eq(member));
    }

    @Test
    void invalidCreateBodyIsRejectedBeforeQuotaOrService() throws Exception {
        request.setGuestCount(0);
        mvc.perform(post("/api/reservations/requests/result").contentType("application/json").content(mapper.writeValueAsString(request)))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(service, limiter);
    }

    @Test
    void resultQuotaAndPayloadConflictKeepTheirExistingErrorStatus() throws Exception {
        when(limiter.tryConsume("reservation-result:1", RateLimiter.Policy.PROFILE_READ)).thenReturn(false);
        mvc.perform(post("/api/reservations/requests/result").contentType("application/json").content(mapper.writeValueAsString(request)))
                .andExpect(status().isTooManyRequests());
        verifyNoInteractions(service);
        when(limiter.tryConsume("reservation-result:1", RateLimiter.Policy.PROFILE_READ)).thenReturn(true);
        when(service.recoverReservation(any(), eq(member))).thenThrow(new ReservationException("이미 사용한 요청 번호예요.", HttpStatus.CONFLICT));
        mvc.perform(post("/api/reservations/requests/result").contentType("application/json").content(mapper.writeValueAsString(request)))
                .andExpect(status().isConflict());
    }
}
