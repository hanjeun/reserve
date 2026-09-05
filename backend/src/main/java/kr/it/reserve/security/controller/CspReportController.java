package kr.it.reserve.security.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.util.Locale;
import java.util.Set;

/**
 * CSP Report-Only 위반 수집기. URL 경로·쿼리·문서 주소는 로그에 남기지 않고
 * 지시문 범주와 차단 URI의 scheme만 남겨 인증값이나 개인정보 유출을 막는다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class CspReportController {

    private static final int MAX_BODY_LENGTH = 32_768;
    private static final int MAX_REPORTS_PER_REQUEST = 10;
    private static final Set<String> DIRECTIVE_CATEGORIES = Set.of(
            "default", "script", "style", "img", "connect", "font",
            "frame", "form", "worker", "media", "object", "base"
    );

    private final ObjectMapper objectMapper;

    @PostMapping(value = "/api/csp-reports", consumes = "*/*")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void collect(@RequestBody(required = false) String body) {
        if (body == null || body.isBlank() || body.length() > MAX_BODY_LENGTH) return;

        try {
            JsonNode root = objectMapper.readTree(body);
            if (root.isArray()) {
                int count = 0;
                for (JsonNode report : root) {
                    if (count++ >= MAX_REPORTS_PER_REQUEST) break;
                    record(report.path("body"));
                }
                return;
            }
            record(root.has("csp-report") ? root.path("csp-report") : root);
        } catch (Exception ignored) {
            // 브라우저 진단 전용 엔드포인트이므로 잘못된 외부 입력이 사용자 요청을 실패시키지 않는다.
        }
    }

    private void record(JsonNode report) {
        String directive = firstText(
                report,
                "effective-directive", "effectiveDirective",
                "violated-directive", "violatedDirective"
        );
        String blockedUri = firstText(report, "blocked-uri", "blockedURL", "blockedUrl");
        log.warn("CSP violation observed: directive={}, blockedScheme={}",
                directiveCategory(directive), blockedScheme(blockedUri));
    }

    private String firstText(JsonNode node, String... fields) {
        for (String field : fields) {
            String value = node.path(field).asText("");
            if (!value.isBlank()) return value;
        }
        return "";
    }

    private String directiveCategory(String directive) {
        String normalized = directive.toLowerCase(Locale.ROOT);
        int separator = normalized.indexOf('-');
        String category = separator < 0 ? normalized : normalized.substring(0, separator);
        return DIRECTIVE_CATEGORIES.contains(category) ? category : "other";
    }

    private String blockedScheme(String blockedUri) {
        if (blockedUri == null || blockedUri.isBlank()) return "unknown";
        String normalized = blockedUri.toLowerCase(Locale.ROOT);
        if (normalized.equals("inline") || normalized.equals("eval") || normalized.equals("self")) {
            return normalized;
        }
        try {
            String scheme = URI.create(blockedUri).getScheme();
            if (scheme == null) return "relative";
            return switch (scheme.toLowerCase(Locale.ROOT)) {
                case "http", "https", "data", "blob" -> scheme.toLowerCase(Locale.ROOT);
                default -> "other";
            };
        } catch (IllegalArgumentException ignored) {
            return "invalid";
        }
    }
}
