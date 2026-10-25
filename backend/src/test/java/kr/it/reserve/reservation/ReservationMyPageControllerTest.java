package kr.it.reserve.reservation;

import com.fasterxml.jackson.databind.ObjectMapper;
import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.controller.ReservationApiController;
import kr.it.reserve.reservation.dto.ReservationResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.service.ReservationService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ReservationMyPageControllerTest {
    private final ReservationService service = mock(ReservationService.class);
    private final Member member = Member.builder().id(7L).build();
    private MockMvc mvc;

    @BeforeEach
    void prepare() {
        mvc = standaloneSetup(new ReservationApiController(service, mock(RateLimiter.class)))
                .setControllerAdvice(new GlobalExceptionHandler())
                .setMessageConverters(new MappingJackson2HttpMessageConverter(new ObjectMapper().findAndRegisterModules())).build();
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(member, null, List.of()));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/reservations/my/page", "/api/reservations/my-reservations/page"})
    void bothAliasesUseTheAuthenticatedMemberAndForwardAllServerPageFilters(String path) throws Exception {
        when(service.getMyReservations(member, 2, 15, "가게", Reservation.ReservationStatus.PENDING, "visit"))
                .thenReturn(new PageImpl<>(List.of(ReservationResponse.builder().id(23L).build()), PageRequest.of(2, 15), 31));

        mvc.perform(get(path).param("page", "2").param("size", "15").param("search", "가게")
                        .param("status", "PENDING").param("sort", "visit").param("memberId", "999"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.content[0].id").value(23));
        verify(service).getMyReservations(member, 2, 15, "가게", Reservation.ReservationStatus.PENDING, "visit");
        verifyNoMoreInteractions(service);
    }

    @Test
    void invalidStatusCannotBecomeAnUnfilteredQuery() throws Exception {
        mvc.perform(get("/api/reservations/my/page").param("status", "NOT_A_STATUS")).andExpect(status().isBadRequest());
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(strings = {"/api/reservations/my", "/api/reservations/my-reservations"})
    void legacyAliasesRequireReloadWithoutLoadingAnyReservationHistory(String path) throws Exception {
        mvc.perform(get(path).param("page", "0").param("size", "15"))
                .andExpect(status().isGone()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("예약 조회 방식이 변경됐어요. 화면을 새로고침한 뒤 다시 시도해주세요."))
                .andExpect(jsonPath("$.data").value(org.hamcrest.Matchers.nullValue()));
        verifyNoInteractions(service);
    }
}
