package kr.it.reserve.payment.service;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;

/**
 * 로그인 인증 대신 원본 본문의 서명으로 PortOne 웹훅을 검증한다.
 * <a href="https://www.standardwebhooks.com/">Standard Webhooks</a>의
 * {@code webhook-id.webhook-timestamp.본문}을 HMAC-SHA256으로 검증한다.
 * 시크릿의 선택적 whsec_ 접두사를 제거하고 base64 디코딩한 바이트를 키로 사용한다.
 * 공백으로 구분된 v1 서명 중 하나가 일치하면 허용하며 시각 허용 범위도 검사한다.
 * JSON 재직렬화는 서명을 바꾸므로 원본 본문을 전달해야 한다. 키가 없거나 잘못되면 거부한다.
 */
@Slf4j
@Component
public class PortoneWebhookVerifier {

    /** 재생 공격 방어. Standard Webhooks 참조 구현들이 쓰는 값과 같은 5분. */
    private static final Duration TOLERANCE = Duration.ofMinutes(5);

    private static final String SECRET_PREFIX = "whsec_";
    private static final String HMAC_ALGORITHM = "HmacSHA256";

    @Value("${portone.webhook-secret:}")
    private String webhookSecret;

    private byte[] signingKey;

    @PostConstruct
    void init() {
        if (webhookSecret == null || webhookSecret.isBlank()) {
            log.error("PORTONE_WEBHOOK_SECRET is empty - every PortOne webhook will be rejected");
            return;
        }
        String raw = webhookSecret.startsWith(SECRET_PREFIX)
                ? webhookSecret.substring(SECRET_PREFIX.length())
                : webhookSecret;
        try {
            this.signingKey = Base64.getDecoder().decode(raw);
            log.info("PortOne webhook secret loaded ({} bytes)", this.signingKey.length);
        } catch (IllegalArgumentException e) {
            // base64 가 아니면 그대로 바이트로 쓰지 않는다 — 조용히 다른 키를 쓰면
            // "검증은 도는데 항상 실패"라는 가장 진단하기 어려운 상태가 된다.
            log.error("PORTONE_WEBHOOK_SECRET is not valid base64 - every PortOne webhook will be rejected");
        }
    }

    /**
     * @param webhookId        {@code webhook-id} 헤더
     * @param webhookTimestamp {@code webhook-timestamp} 헤더 (유닉스 초)
     * @param signatureHeader  {@code webhook-signature} 헤더
     * @param rawBody          <b>가공하지 않은</b> 요청 본문
     * @return 서명과 시각이 모두 유효하면 true
     */
    public boolean isValid(String webhookId, String webhookTimestamp, String signatureHeader, String rawBody) {
        if (signingKey == null) {
            log.error("PortOne webhook rejected - no signing key configured");
            return false;
        }
        if (isBlank(webhookId) || isBlank(webhookTimestamp) || isBlank(signatureHeader) || rawBody == null) {
            log.warn("PortOne webhook rejected - missing headers or body");
            return false;
        }
        if (!isTimestampFresh(webhookTimestamp)) {
            return false;
        }

        String signedContent = webhookId + "." + webhookTimestamp + "." + rawBody;
        String expected = base64Hmac(signedContent);
        if (expected == null) {
            return false;
        }

        // 헤더에 여러 서명이 공백으로 올 수 있다(키 교체 기간). 하나라도 맞으면 통과.
        for (String part : signatureHeader.trim().split("\\s+")) {
            if (matchesSignaturePart(part, expected)) {
                return true;
            }
        }
        log.warn("PortOne webhook rejected - signature mismatch: webhookId={}", webhookId);
        return false;
    }

    private static boolean matchesSignaturePart(String part, String expected) {
        int comma = part.indexOf(',');
        if (comma < 0) {
            return false;
        }
        String version = part.substring(0, comma);
        String value = part.substring(comma + 1);
        if (!"v1".equals(version)) {
            return false;   // v1a(비대칭)는 이 프로젝트에서 쓰지 않는다
        }
        // 반드시 상수 시간 비교. equals 는 앞에서부터 비교하다 다르면 즉시 빠져나가므로
        //   응답 시간 차이로 서명을 한 바이트씩 알아낼 수 있다(타이밍 공격).
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                value.getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 재생 공격 방어. 오래된 요청은 서명이 맞아도 거부한다 —
     * 한 번 유출된 요청을 그대로 다시 보내는 게 가장 값싼 공격이기 때문이다.
     */
    private boolean isTimestampFresh(String webhookTimestamp) {
        try {
            Instant sent = Instant.ofEpochSecond(Long.parseLong(webhookTimestamp.trim()));
            Duration drift = Duration.between(sent, Instant.now()).abs();
            if (drift.compareTo(TOLERANCE) > 0) {
                log.warn("PortOne webhook rejected - timestamp outside tolerance: driftSeconds={}", drift.toSeconds());
                return false;
            }
            return true;
        } catch (NumberFormatException e) {
            log.warn("PortOne webhook rejected - unparseable timestamp header");
            return false;
        }
    }

    private String base64Hmac(String content) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALGORITHM);
            mac.init(new SecretKeySpec(signingKey, HMAC_ALGORITHM));
            return Base64.getEncoder().encodeToString(mac.doFinal(content.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            log.error("PortOne webhook signature computation failed: errorType={}", e.getClass().getSimpleName());
            return null;
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
