package kr.it.reserve.config.oauth2.events;

import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/oauth/events/naver")
@RequiredArgsConstructor
public class NaverUnlinkEventController {
    private static final int MAXIMUM_REQUEST_BYTES = 4096;
    private final NaverUnlinkEventVerifier verifier;
    private final OAuthSecurityEventService service;

    @PostMapping(consumes = "application/x-www-form-urlencoded")
    public ResponseEntity<Void> receive(HttpServletRequest request) {
        try {
            Map<String, String> parameters = new LinkedHashMap<>();
            String query = request.getQueryString();
            if (query != null) {
                if (query.length() > MAXIMUM_REQUEST_BYTES) throw oversized();
                parse(query, parameters);
            }
            if (request.getContentLengthLong() > MAXIMUM_REQUEST_BYTES) throw oversized();
            byte[] bytes = request.getInputStream().readNBytes(MAXIMUM_REQUEST_BYTES + 1);
            if (bytes.length > MAXIMUM_REQUEST_BYTES) throw oversized();
            parse(new String(bytes, StandardCharsets.UTF_8), parameters);
            service.receive(verifier.verify(parameters));
            return ResponseEntity.noContent().build();
        } catch (OAuthSecurityEventException exception) {
            return ResponseEntity.status(exception.status()).build();
        } catch (Exception exception) {
            log.error("OAuth security event processing failed: provider=NAVER, errorType={}",
                    exception.getClass().getSimpleName());
            // 공식 규격은 실패를 재전송하지 않는다. 실패를 성공 204로 감추지 않는다.
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
    }

    private void parse(String encoded, Map<String, String> parameters) {
        if (encoded.isEmpty()) return;
        try {
            for (String field : encoded.split("&", -1)) {
                int separator = field.indexOf('=');
                if (separator < 1) throw OAuthSecurityEventException.invalid("invalid_request");
                String key = URLDecoder.decode(field.substring(0, separator), StandardCharsets.UTF_8);
                String value = URLDecoder.decode(field.substring(separator + 1), StandardCharsets.UTF_8);
                if (parameters.putIfAbsent(key, value) != null) throw OAuthSecurityEventException.invalid("invalid_request");
            }
        } catch (IllegalArgumentException exception) {
            throw OAuthSecurityEventException.invalid("invalid_request");
        }
    }

    private OAuthSecurityEventException oversized() {
        return new OAuthSecurityEventException("invalid_request", HttpStatus.PAYLOAD_TOO_LARGE);
    }
}
