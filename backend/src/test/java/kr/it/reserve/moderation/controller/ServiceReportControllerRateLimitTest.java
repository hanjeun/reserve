package kr.it.reserve.moderation.controller;

import kr.it.reserve.global.error.GlobalExceptionHandler;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.moderation.entity.ServiceReport.TargetType;
import kr.it.reserve.moderation.service.ServiceReportService;
import kr.it.reserve.moderation.service.ServiceReportService.Reason;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;

import static kr.it.reserve.global.ratelimit.RateLimiter.Policy.CHAT_REPORT;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup;

class ServiceReportControllerRateLimitTest {
    private static final String IP = "203.0.113.9";
    private final ServiceReportService service = mock(ServiceReportService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final MockMvc mvc = standaloneSetup(new ServiceReportController(service, limiter))
            .setControllerAdvice(new GlobalExceptionHandler()).build();
    private final Member member = Member.builder().id(7L).role(Role.USER).termsAgreed(true).build();

    @BeforeEach
    void authenticate() {
        authenticate(member);
        when(limiter.tryConsume(anyString(), eq(CHAT_REPORT))).thenReturn(true);
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @ParameterizedTest
    @EnumSource(TargetType.class)
    void anExhaustedIpBlocksEachReportTypeBeforeMemberQuotaOrDatabase(TargetType type) throws Exception {
        when(limiter.tryConsume("review-report-ip:" + IP, CHAT_REPORT)).thenReturn(false);

        mvc.perform(submission(type, IP)).andExpect(status().isTooManyRequests());

        verify(limiter, never()).tryConsume("review-report-member:7", CHAT_REPORT);
        verifyNoInteractions(service);
    }

    @Test
    void anExhaustedIpAlsoBlocksAnAppealBeforeMemberQuotaOrDatabase() throws Exception {
        when(limiter.tryConsume("review-report-ip:" + IP, CHAT_REPORT)).thenReturn(false);

        mvc.perform(appeal(31L, IP)).andExpect(status().isTooManyRequests());

        verify(limiter, never()).tryConsume("review-report-member:7", CHAT_REPORT);
        verifyNoInteractions(service);
    }

    @Test
    void changingIpAndSwitchingBetweenReportsAndAppealsDoesNotResetTheMemberQuota() throws Exception {
        when(limiter.tryConsume("review-report-member:7", CHAT_REPORT)).thenReturn(true, false, false);

        mvc.perform(submission(TargetType.REVIEW, IP)).andExpect(status().isOk());
        mvc.perform(submission(TargetType.RESERVATION, "198.51.100.7")).andExpect(status().isTooManyRequests());
        mvc.perform(appeal(31L, "192.0.2.8")).andExpect(status().isTooManyRequests());

        verify(limiter, times(3)).tryConsume("review-report-member:7", CHAT_REPORT);
        verify(service).submit(member, TargetType.REVIEW, 14L, Reason.ABUSE, "신고 근거");
        verify(service, never()).submit(any(), eq(TargetType.RESERVATION), anyLong(), any(), anyString());
        verify(service, never()).appeal(any(), anyLong(), anyString(), anyLong());
    }

    @Test
    void changingMemberDoesNotResetTheSharedIpQuota() throws Exception {
        when(limiter.tryConsume("review-report-ip:" + IP, CHAT_REPORT)).thenReturn(true, false);

        mvc.perform(submission(TargetType.RESERVATION, IP)).andExpect(status().isOk());
        authenticate(Member.builder().id(8L).role(Role.USER).termsAgreed(true).build());
        mvc.perform(appeal(32L, IP)).andExpect(status().isTooManyRequests());

        verify(service).submit(member, TargetType.RESERVATION, 14L, Reason.NO_SHOW, "신고 근거");
        verify(limiter, never()).tryConsume("review-report-member:8", CHAT_REPORT);
        verify(service, never()).appeal(any(), anyLong(), anyString(), anyLong());
    }

    @Test
    void anAllowedAppealKeepsTheReporterAndRevision() throws Exception {
        mvc.perform(appeal(31L, IP)).andExpect(status().isOk());

        verify(service).appeal(member, 31L, "이의 근거", 2L);
        verify(limiter).tryConsume("review-report-ip:" + IP, CHAT_REPORT);
        verify(limiter).tryConsume("review-report-member:7", CHAT_REPORT);
    }

    @Test
    void readingReportsDoesNotConsumeTheWriteQuota() throws Exception {
        mvc.perform(get("/api/service-reports/mine")).andExpect(status().isOk());

        verify(service).mine(member, 0, 20);
        verifyNoInteractions(limiter);
    }

    private static void authenticate(Member actor) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(actor, null, List.of()));
    }

    private static MockHttpServletRequestBuilder submission(TargetType type, String ip) {
        String reason = type == TargetType.REVIEW ? "ABUSE" : "NO_SHOW";
        return post("/api/service-reports").with(request -> { request.setRemoteAddr(ip); return request; })
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"type":"%s","targetId":14,"reason":"%s","details":"신고 근거"}
                        """.formatted(type, reason));
    }

    private static MockHttpServletRequestBuilder appeal(Long id, String ip) {
        return post("/api/service-reports/{id}/appeal", id).with(request -> { request.setRemoteAddr(ip); return request; })
                .contentType(MediaType.APPLICATION_JSON).content("""
                        {"details":"이의 근거","revision":2}
                        """);
    }
}
