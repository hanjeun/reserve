package kr.it.reserve.email.controller;

import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.global.ratelimit.RateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class EmailResponseContractTest {
    private final EmailVerificationService verification = mock(EmailVerificationService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final EmailApiController controller = new EmailApiController(verification, limiter);
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final Instant expiresAt = Instant.parse("2026-10-08T12:05:00Z");

    @BeforeEach void allowRequests() {
        request.setRemoteAddr("127.0.0.1");
        when(limiter.tryConsume(anyString(), any(RateLimiter.Policy.class))).thenReturn(true);
    }

    @Test void sendReturnsTheServerDeadlineInsideTheSharedDataEnvelope() {
        when(verification.sendVerificationCode("member@example.com")).thenReturn(expiresAt);
        var response = controller.sendVerificationCode(Map.of("email", "member@example.com"), request);
        assertThat(response.getBody().isSuccess()).isTrue();
        assertThat(response.getBody().getData().get("expiresAt")).isEqualTo(expiresAt);
        assertThat(response.getHeaders().getCacheControl()).contains("no-store");
    }

    @Test void verifyReturnsTheMemoryOnlySignupProofInsideTheSharedDataEnvelope() {
        var proof = new EmailVerificationService.VerificationResult("a".repeat(43), expiresAt);
        when(verification.verifyCodeAndIssueTicket("member@example.com", "123456")).thenReturn(proof);
        var response = controller.verifyCode(Map.of("email", "member@example.com", "code", "123456"), request);
        assertThat(response.getBody().isSuccess()).isTrue();
        assertThat(response.getBody().getData()).isEqualTo(proof);
        assertThat(response.getHeaders().getCacheControl()).contains("no-store");
    }

    @Test void aConcurrentFirstIssueLockConflictReturnsRetryWithoutExposingTheDatabaseError() throws Exception {
        when(verification.sendVerificationCode("member@example.com"))
                .thenThrow(new CannotAcquireLockException("private SQL and email must not be exposed"));
        MockMvcBuilders.standaloneSetup(controller).build().perform(post("/api/email/send-code")
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"member@example.com\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().string("Retry-After", "1"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("인증 요청을 처리 중이에요. 잠시 후 다시 시도해주세요."));
        verify(verification).sendVerificationCode("member@example.com");
    }
}
