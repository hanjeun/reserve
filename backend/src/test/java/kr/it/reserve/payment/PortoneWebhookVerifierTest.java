package kr.it.reserve.payment;

import kr.it.reserve.payment.service.PortoneWebhookVerifier;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 웹훅 서명 검증.
 *
 * <h2>왜 이 테스트가 제일 중요한가</h2>
 * 웹훅 엔드포인트는 <b>인증 없이 열려 있다</b>(PG 서버가 부르므로). 서명 검증이 유일한 문지기라,
 * 여기가 뚫리면 아무나 "이 결제 취소됐다"를 쏴서 예약을 취소시키거나 환불 상태를 조작할 수 있다.
 *
 * <p>스프링 컨텍스트를 띄우지 않고 시크릿을 직접 주입한다 — 검증 대상이 순수한 암호 계산이라
 * 컨텍스트가 필요 없고, <b>시크릿이 없을 때 전부 거부하는지</b>도 여기서 함께 확인할 수 있다.
 */
class PortoneWebhookVerifierTest {

    private static final String SECRET_B64 = "dGVzdC13ZWJob29rLXNlY3JldC0xMjM0NTY3OA==";
    private static final String WEBHOOK_ID = "msg_01HTEST";
    private static final String BODY = "{\"type\":\"Transaction.Cancelled\",\"data\":{\"paymentId\":\"order-1\"}}";

    private PortoneWebhookVerifier verifier;

    @BeforeEach
    void setUp() {
        verifier = configured("whsec_" + SECRET_B64);
    }

    private PortoneWebhookVerifier configured(String secret) {
        PortoneWebhookVerifier v = new PortoneWebhookVerifier();
        ReflectionTestUtils.setField(v, "webhookSecret", secret);
        ReflectionTestUtils.invokeMethod(v, "init");
        return v;
    }

    /** 규격 그대로: HMAC-SHA256("{id}.{timestamp}.{body}") 를 base64 로. */
    private static String sign(String id, String timestamp, String body) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(Base64.getDecoder().decode(SECRET_B64), "HmacSHA256"));
        byte[] out = mac.doFinal((id + "." + timestamp + "." + body).getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(out);
    }

    private static String now() {
        return String.valueOf(Instant.now().getEpochSecond());
    }

    @Test
    @DisplayName("올바른 서명은 통과한다")
    void validSignaturePasses() throws Exception {
        String ts = now();
        String header = "v1," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(verifier.isValid(WEBHOOK_ID, ts, header, BODY)).isTrue();
    }

    @Test
    @DisplayName("본문이 한 글자라도 바뀌면 거부한다")
    void tamperedBodyFails() throws Exception {
        String ts = now();
        String header = "v1," + sign(WEBHOOK_ID, ts, BODY);

        String tampered = BODY.replace("order-1", "order-2");

        assertThat(verifier.isValid(WEBHOOK_ID, ts, header, tampered)).isFalse();
    }

    @Test
    @DisplayName("서명은 맞아도 오래된 요청은 거부한다 — 재생 공격 방어")
    void staleTimestampFails() throws Exception {
        String stale = String.valueOf(Instant.now().minusSeconds(60 * 60).getEpochSecond());
        String header = "v1," + sign(WEBHOOK_ID, stale, BODY);

        assertThat(verifier.isValid(WEBHOOK_ID, stale, header, BODY)).isFalse();
    }

    @Test
    @DisplayName("webhook-id 가 다르면 거부한다 — 서명 대상에 id 가 포함되므로")
    void differentIdFails() throws Exception {
        String ts = now();
        String header = "v1," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(verifier.isValid("msg_OTHER", ts, header, BODY)).isFalse();
    }

    @Test
    @DisplayName("공백으로 구분된 서명이 여러 개면 하나만 맞아도 통과한다 — 키 교체 기간 대응")
    void multipleSignaturesOneValid() throws Exception {
        String ts = now();
        String header = "v1,AAAAinvalidAAAA= v1," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(verifier.isValid(WEBHOOK_ID, ts, header, BODY)).isTrue();
    }

    @Test
    @DisplayName("v1 이 아닌 버전만 오면 거부한다")
    void nonV1VersionIsIgnored() throws Exception {
        String ts = now();
        String header = "v1a," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(verifier.isValid(WEBHOOK_ID, ts, header, BODY)).isFalse();
    }

    @Test
    @DisplayName("헤더가 빠지면 거부한다")
    void missingHeadersFail() throws Exception {
        String ts = now();
        String header = "v1," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(verifier.isValid(null, ts, header, BODY)).isFalse();
        assertThat(verifier.isValid(WEBHOOK_ID, null, header, BODY)).isFalse();
        assertThat(verifier.isValid(WEBHOOK_ID, ts, null, BODY)).isFalse();
        assertThat(verifier.isValid(WEBHOOK_ID, ts, header, null)).isFalse();
    }

    @Test
    @DisplayName("시각 헤더가 숫자가 아니면 거부한다")
    void unparseableTimestampFails() throws Exception {
        String ts = now();
        String header = "v1," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(verifier.isValid(WEBHOOK_ID, "not-a-number", header, BODY)).isFalse();
    }

    @Test
    @DisplayName("★ 시크릿이 비어 있으면 전부 거부한다 — fail-closed")
    void noSecretRejectsEverything() throws Exception {
        PortoneWebhookVerifier unconfigured = configured("");
        String ts = now();
        String header = "v1," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(unconfigured.isValid(WEBHOOK_ID, ts, header, BODY)).isFalse();
    }

    @Test
    @DisplayName("시크릿이 base64 가 아니면 전부 거부한다 — 조용히 다른 키를 쓰지 않는다")
    void invalidBase64SecretRejectsEverything() throws Exception {
        PortoneWebhookVerifier broken = configured("whsec_!!!not-base64!!!");
        String ts = now();
        String header = "v1," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(broken.isValid(WEBHOOK_ID, ts, header, BODY)).isFalse();
    }

    @Test
    @DisplayName("whsec_ 접두사가 없어도 같은 키로 동작한다")
    void secretWithoutPrefixWorks() throws Exception {
        PortoneWebhookVerifier noPrefix = configured(SECRET_B64);
        String ts = now();
        String header = "v1," + sign(WEBHOOK_ID, ts, BODY);

        assertThat(noPrefix.isValid(WEBHOOK_ID, ts, header, BODY)).isTrue();
    }
}
