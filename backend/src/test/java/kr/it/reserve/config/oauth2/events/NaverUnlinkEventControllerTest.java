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
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class NaverUnlinkEventControllerTest {
    private final NaverUnlinkEventVerifier verifier = mock(NaverUnlinkEventVerifier.class);
    private final OAuthSecurityEventService service = mock(OAuthSecurityEventService.class);
    private final NaverUnlinkEventController controller = new NaverUnlinkEventController(verifier, service);

    @Test
    void boundedFormAndOfficialQueryExampleBothProduceAnEmpty204OnlyAfterTheTransaction() {
        Map<String, String> parameters = Map.of("clientId", "client", "encryptUniqueId", "cipher", "timestamp", "1", "signature", "mac");
        VerifiedOAuthSecurityEvent event = new VerifiedOAuthSecurityEvent(AuthProvider.NAVER, "event", Instant.EPOCH,
                List.of(new VerifiedOAuthSecurityEvent.Action("subject", true)));
        when(verifier.verify(parameters)).thenReturn(event);
        MockHttpServletRequest form = request("clientId=client&encryptUniqueId=cipher&timestamp=1&signature=mac");
        assertThat(controller.receive(form).getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        verify(service).receive(event);

        MockHttpServletRequest query = request("");
        query.setQueryString("clientId=client&encryptUniqueId=cipher&timestamp=1&signature=mac");
        assertThat(controller.receive(query).getBody()).isNull();
    }

    @Test
    void duplicateDecodedFieldsAcrossQueryAndFormAndMalformedEscapesNeverReachVerificationOrStorage() {
        MockHttpServletRequest duplicate = request("client%49d=second");
        duplicate.setQueryString("clientId=first");
        assertThat(controller.receive(duplicate).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(controller.receive(request("clientId=%invalid")).getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        verifyNoInteractions(verifier, service);
    }

    @Test
    void chunkedBodyStopsAt4097BytesWithoutParsingOrAuthenticatingTheWholeRequest() {
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
        assertThat(controller.receive(request).getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(bytesRead).hasValue(4097);
        verifyNoInteractions(verifier, service);
    }

    @Test
    void authenticationAndCommitFailuresNeverReturnSuccessfulAcknowledgement() {
        when(verifier.verify(Map.of("clientId", "client"))).thenThrow(
                new OAuthSecurityEventException("invalid_signature", HttpStatus.FORBIDDEN));
        assertThat(controller.receive(request("clientId=client")).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
        verifyNoInteractions(service);

        VerifiedOAuthSecurityEvent event = new VerifiedOAuthSecurityEvent(AuthProvider.NAVER, "event", Instant.EPOCH, List.of());
        when(verifier.verify(Map.of("clientId", "verified"))).thenReturn(event);
        doThrow(new IllegalStateException("synthetic database error")).when(service).receive(event);
        assertThat(controller.receive(request("clientId=verified")).getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    private MockHttpServletRequest request(String body) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setContentType("application/x-www-form-urlencoded");
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        return request;
    }
}
