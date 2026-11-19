package kr.it.reserve.global;

import kr.it.reserve.email.controller.EmailApiController;
import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.global.error.EmailException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.controller.PasswordResetController;
import kr.it.reserve.member.dto.PasswordResetRequest;
import kr.it.reserve.member.service.PasswordResetService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class VerificationRateLimitTest {
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final MockHttpServletRequest request = new MockHttpServletRequest();

    @Test
    void blockedSignupVerificationCannotConsumeAnotherAccountsQuota() {
        request.setRemoteAddr("192.0.2.10");
        var verification = mock(EmailVerificationService.class);
        var controller = new EmailApiController(verification, limiter);

        assertThatThrownBy(() -> controller.verifyCode(
                Map.of("email", "member@example.com", "code", "123456"), request))
                .isInstanceOf(EmailException.class);

        verify(limiter).tryConsume("192.0.2.10", RateLimiter.Policy.CODE_VERIFY);
        verifyNoMoreInteractions(limiter);
        verifyNoInteractions(verification);
    }

    @Test
    void resetRequestsHaveTheSameAcknowledgmentBeforeMemberLookup() {
        request.setRemoteAddr("192.0.2.10");
        var service = mock(PasswordResetService.class);
        List<Runnable> queued = new ArrayList<>();
        var controller = new PasswordResetController(service, limiter, queued::add);
        when(limiter.tryConsume(anyString(), eq(RateLimiter.Policy.EMAIL_SEND))).thenReturn(true);
        when(service.sendResetCode("member@example.com")).thenReturn(true);

        var first = controller.sendCode(Map.of("email", " MEMBER@example.com "), request);
        var second = controller.sendCode(Map.of("email", "missing@example.com"), request);
        assertThat(first.getStatusCode().value()).isEqualTo(200);
        assertThat(second.getStatusCode()).isEqualTo(first.getStatusCode());
        assertThat(first.getBody().getMessage()).isEqualTo(second.getBody().getMessage());
        assertThat(first.getBody().getMessage()).contains("이메일 로그인이 설정된 주소라면");
        assertThat(first.getBody().getData()).isNull();
        assertThat(second.getBody().getData()).isNull();
        verifyNoInteractions(service);

        assertThat(queued).hasSize(2);
        queued.forEach(Runnable::run);
        verify(service).sendResetCode("member@example.com");
        verify(service).sendResetCode("missing@example.com");
    }

    @Test
    void resetSendQuotaUsesTheSameNormalizedAddressAcrossIps() {
        request.setRemoteAddr("192.0.2.11");
        var service = mock(PasswordResetService.class);
        List<Runnable> queued = new ArrayList<>();
        var controller = new PasswordResetController(service, limiter, queued::add);
        when(limiter.tryConsume("192.0.2.11", RateLimiter.Policy.EMAIL_SEND)).thenReturn(true);
        when(limiter.tryConsume("192.0.2.12", RateLimiter.Policy.EMAIL_SEND)).thenReturn(true);
        when(limiter.tryConsume("password-reset:email:member@example.com", RateLimiter.Policy.EMAIL_SEND))
                .thenReturn(true, false);

        assertThat(controller.sendCode(Map.of("email", "member@example.com"), request).getStatusCode().value())
                .isEqualTo(200);
        request.setRemoteAddr("192.0.2.12");
        assertThat(controller.sendCode(Map.of("email", " MEMBER@example.com "), request).getStatusCode().value())
                .isEqualTo(429);
        assertThat(queued).hasSize(1);
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void blockedResetVerificationCannotConsumeAnotherAccountsQuota(boolean reset) {
        request.setRemoteAddr("192.0.2.10");
        var service = mock(PasswordResetService.class);
        var controller = new PasswordResetController(service, limiter, Runnable::run);
        var body = new PasswordResetRequest();
        body.setEmail("member@example.com");
        body.setCode("123456");
        body.setNewPassword("synthetic1234");

        var response = reset ? controller.resetPassword(body, request)
                : controller.verifyCode(Map.of("email", body.getEmail(), "code", body.getCode()), request);

        assertThat(response.getStatusCode().value()).isEqualTo(429);
        verify(limiter).tryConsume("192.0.2.10", RateLimiter.Policy.CODE_VERIFY);
        verifyNoMoreInteractions(limiter);
        verifyNoInteractions(service);
    }
}
