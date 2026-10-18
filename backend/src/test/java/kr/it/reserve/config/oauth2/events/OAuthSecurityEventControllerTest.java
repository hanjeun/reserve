package kr.it.reserve.config.oauth2.events;

import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletInputStream;
import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OAuthSecurityEventControllerTest {
    @Test
    void authenticatesTheRawTokenBeforeCallingTheTransactionalReceiver() {
        OAuthSecurityEventVerifier verifier = mock(OAuthSecurityEventVerifier.class);
        OAuthSecurityEventService service = mock(OAuthSecurityEventService.class);
        VerifiedOAuthSecurityEvent event = new VerifiedOAuthSecurityEvent(AuthProvider.KAKAO, "event", Instant.now(), List.of());
        when(verifier.verify(AuthProvider.KAKAO, "signed-token")).thenReturn(event);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContent("signed-token".getBytes(StandardCharsets.UTF_8));

        assertThat(new OAuthSecurityEventController(verifier, service).kakao(request).getStatusCode())
                .isEqualTo(HttpStatus.ACCEPTED);
        verify(service).receive(event);
    }

    @Test
    void validationFailureDoesNotReachTheDatabase() {
        OAuthSecurityEventVerifier verifier = mock(OAuthSecurityEventVerifier.class);
        OAuthSecurityEventService service = mock(OAuthSecurityEventService.class);
        when(verifier.verify(AuthProvider.GOOGLE, "unsigned"))
                .thenThrow(OAuthSecurityEventException.invalid("invalid_key"));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContent("unsigned".getBytes(StandardCharsets.UTF_8));

        var response = new OAuthSecurityEventController(verifier, service).google(request);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().toString()).contains("invalid_key").doesNotContain("unsigned");
        verifyNoInteractions(service);
    }

    @Test
    void chunkedBodyStopsAtTheHardByteLimitBeforeBuildingATokenOrFetchingKeys() {
        AtomicInteger bytesRead = new AtomicInteger();
        MockHttpServletRequest request = new MockHttpServletRequest() {
            @Override public long getContentLengthLong() { return -1; }
            @Override public ServletInputStream getInputStream() {
                return new ServletInputStream() {
                    @Override public int read() { bytesRead.incrementAndGet(); return 'x'; }
                    @Override public boolean isFinished() { return false; }
                    @Override public boolean isReady() { return true; }
                    @Override public void setReadListener(ReadListener listener) { }
                };
            }
        };
        OAuthSecurityEventVerifier verifier = mock(OAuthSecurityEventVerifier.class);
        OAuthSecurityEventService service = mock(OAuthSecurityEventService.class);

        assertThat(new OAuthSecurityEventController(verifier, service).google(request).getStatusCode())
                .isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(bytesRead).hasValue(32_769);
        verifyNoInteractions(verifier, service);
    }
}
