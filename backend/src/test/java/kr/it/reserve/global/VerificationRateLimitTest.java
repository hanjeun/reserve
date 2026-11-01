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

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void blockedResetVerificationCannotConsumeAnotherAccountsQuota(boolean reset) {
        request.setRemoteAddr("192.0.2.10");
        var service = mock(PasswordResetService.class);
        var controller = new PasswordResetController(service, limiter);
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
