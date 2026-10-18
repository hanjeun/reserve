package kr.it.reserve.config.oauth2.events;

import kr.it.reserve.member.entity.AuthProvider;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.nio.charset.StandardCharsets;

@Slf4j
@RestController
@RequestMapping("/api/oauth/events")
@RequiredArgsConstructor
public class OAuthSecurityEventController {
    private static final int MAXIMUM_BODY_BYTES = 32_768;
    private final OAuthSecurityEventVerifier verifier;
    private final OAuthSecurityEventService service;

    @PostMapping(value = "/google", consumes = "application/secevent+jwt")
    public ResponseEntity<?> google(HttpServletRequest request) { return receive(AuthProvider.GOOGLE, request); }

    @PostMapping(value = "/kakao", consumes = "application/secevent+jwt")
    public ResponseEntity<?> kakao(HttpServletRequest request) { return receive(AuthProvider.KAKAO, request); }

    private ResponseEntity<?> receive(AuthProvider provider, HttpServletRequest request) {
        try {
            if (request.getContentLengthLong() > MAXIMUM_BODY_BYTES) throw oversized();
            byte[] bytes = request.getInputStream().readNBytes(MAXIMUM_BODY_BYTES + 1);
            if (bytes.length > MAXIMUM_BODY_BYTES) throw oversized();
            String body = new String(bytes, StandardCharsets.UTF_8);
            VerifiedOAuthSecurityEvent event = verifier.verify(provider, body);
            service.receive(event);
            return ResponseEntity.accepted().build();
        } catch (OAuthSecurityEventException exception) {
            return ResponseEntity.status(exception.status()).body(Map.of(
                    "err", exception.code(), "description", "Security event could not be accepted"));
        } catch (Exception exception) {
            log.error("OAuth security event processing failed: provider={}, errorType={}",
                    provider, exception.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "err", "temporarily_unavailable", "description", "Security event could not be accepted"));
        }
    }

    private OAuthSecurityEventException oversized() {
        return new OAuthSecurityEventException("invalid_request", HttpStatus.PAYLOAD_TOO_LARGE);
    }
}
