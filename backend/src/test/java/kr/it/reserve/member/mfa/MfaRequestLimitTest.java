package kr.it.reserve.member.mfa;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class MfaRequestLimitTest {
    private final MfaService service = mock(MfaService.class);
    private final MfaController controller = new MfaController(service, new CookieUtil("local"), mock(JwtProperties.class), new RateLimiter());
    private final Member member = Member.builder().id(7L).build();
    private final MockHttpServletRequest request = new MockHttpServletRequest();
    private final MockHttpServletResponse response = new MockHttpServletResponse();

    @Test void openingAndClosingThePanelNeverSpendsProofAttempts() {
        when(service.verify(any(), any(), any(), any(), any())).thenReturn(new MfaService.Verification(null, null));
        when(service.beginManage(any(), nullable(String.class), nullable(java.time.LocalDateTime.class), nullable(String.class), anyBoolean(), nullable(String.class)))
                .thenReturn(new MfaService.Ticket("A".repeat(43) + ".0"));
        for (int i = 0; i < 12; i++) {
            controller.manage(member, new MfaController.Manage(null), request, response);
            controller.status(request, member);
            controller.cancel(request, response, member);
        }
        for (int i = 0; i < RateLimiter.Policy.CODE_VERIFY.capacity(); i++)
            controller.verify(request, response, member, new MfaController.Proof("TOTP", "123456"));
        assertThatThrownBy(() -> controller.verify(request, response, member, new MfaController.Proof("BACKUP", "synthetic-code")))
                .isInstanceOf(AuthException.class).hasMessageContaining("인증 시도가 많아요");
        verify(service, times(RateLimiter.Policy.CODE_VERIFY.capacity())).verify(any(), any(), any(), any(), any());
    }

    @Test void proofKindsShareTheSameIpBoundaryAndCancellationRemainsSeparate() {
        when(service.verify(any(), any(), any(), any(), any())).thenReturn(new MfaService.Verification(null, null));
        for (int i = 0; i < RateLimiter.Policy.CODE_VERIFY.capacity(); i++)
            controller.verify(request, response, member, new MfaController.Proof("PASSKEY", "synthetic-proof"));
        assertThatThrownBy(() -> controller.confirmTotp(request, member, new MfaController.Code("123456"))).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> controller.confirmPasskey(request, member, new MfaController.Registration("synthetic-proof", "패스키"))).isInstanceOf(AuthException.class);
        controller.cancel(request, response, member);
        verify(service).cancel(null);
        verify(service, never()).confirmTotp(any(), any(), any(), any());
        verify(service, never()).confirmPasskey(any(), any(), any(), any(), any());
    }

    @Test void aMemberCannotAvoidTheLifecycleBoundaryByChangingIp() {
        for (int i = 0; i < RateLimiter.Policy.MFA_LIFECYCLE_ACCOUNT.capacity(); i++) {
            request.setRemoteAddr("192.0.2." + (i + 1));
            controller.status(request, member);
        }
        request.setRemoteAddr("198.51.100.1");
        assertThatThrownBy(() -> controller.status(request, member)).isInstanceOf(AuthException.class).hasMessageContaining("요청이 많아요");
        controller.status(request, Member.builder().id(8L).build());
        controller.cancel(request, response, member);
        verify(service).cancel(null);
    }
}
