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
 * PortOne 웹훅 서명 검증 — 2026-08-23 신설.
 *
 * <h2>왜 필요한가</h2>
 * 웹훅 엔드포인트는 <b>인증 없이 열려 있어야 한다</b>(PortOne 서버가 부른다).
 * 검증이 없으면 아무나 우리 URL 로 "이 결제 취소됐어요" 를 쏴서 예약을 취소시키거나
 * 결제를 환불 완료로 만들 수 있다. <b>서명 검증이 이 엔드포인트의 유일한 인증이다.</b>
 *
 * <h2>규격 — Standard Webhooks</h2>
 * PortOne V2 는 <a href="https://www.standardwebhooks.com/">Standard Webhooks</a> 를 따른다.
 * <ul>
 *   <li>헤더: {@code webhook-id} · {@code webhook-timestamp} · {@code webhook-signature}</li>
 *   <li>서명 대상 문자열: <b>{@code {webhook-id}.{webhook-timestamp}.{본문}}</b> (마침표로 이어붙임)</li>
 *   <li>알고리즘: HMAC-SHA256, 결과는 base64</li>
 *   <li>헤더 값은 {@code v1,<base64>} 형태이고 <b>공백으로 구분된 여러 개</b>가 올 수 있다
 *       (키 교체 중에는 두 개가 온다). 하나라도 맞으면 통과다.</li>
 *   <li>시크릿은 {@code whsec_} 접두사 + base64. <b>접두사를 떼고 base64 디코딩한 바이트</b>가 키다.</li>
 * </ul>
 *
 * <h2>본문은 반드시 원본 그대로여야 한다</h2>
 * JSON 으로 파싱했다가 다시 직렬화하면 <b>공백·키 순서가 달라져 서명이 깨진다.</b>
 * 컨트롤러가 {@code @RequestBody String} 으로 받아 그대로 넘기는 이유다.
 *
 * <h2>fail-closed</h2>
 * 시크릿이 비어 있으면 <b>전부 거부</b>한다. 검증을 건너뛰고 통과시키면 위 공격이 그대로 열린다 —
 * "설정이 안 됐으니 일단 받아두자"는 이 엔드포인트에서 가장 위험한 선택이다.
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
            int comma = part.indexOf(',');
            if (comma < 0) {
                continue;
            }
            String version = part.substring(0, comma);
            String value = part.substring(comma + 1);
            if (!"v1".equals(version)) {
                continue;   // v1a(비대칭)는 이 프로젝트에서 쓰지 않는다
            }
            // ★ 반드시 상수 시간 비교. equals 는 앞에서부터 비교하다 다르면 즉시 빠져나가므로
            //   응답 시간 차이로 서명을 한 바이트씩 알아낼 수 있다(타이밍 공격).
            if (MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                    value.getBytes(StandardCharsets.UTF_8))) {
                return true;
            }
        }
        log.warn("PortOne webhook rejected - signature mismatch: webhookId={}", webhookId);
        return false;
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
            log.error("PortOne webhook signature computation failed", e);
            return null;
        }
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
