package kr.it.reserve.config.oauth2.events;

import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 합성 규격 값만 사용하며 실제 네이버 계정·비밀키·외부 API는 사용하지 않는다. */
class NaverUnlinkEventVerifierTest {
    private static final Instant NOW = Instant.parse("2026-10-16T01:00:00Z");
    private static final String CLIENT = "synthetic-client";
    private static final String SECRET = "synthetic-secret-not-a-credential";
    private final NaverUnlinkEventVerifier verifier = new NaverUnlinkEventVerifier(true, CLIENT, SECRET,
            Clock.fixed(NOW, ZoneOffset.UTC));

    @Test
    void officialMacAndIvCiphertextFormatIdentifiesTheExactSubjectAndAStableReplayKey() throws Exception {
        Map<String, String> request = signed("naver-한글-subject", NOW);

        VerifiedOAuthSecurityEvent event = verifier.verify(request);

        assertThat(event.provider()).isEqualTo(AuthProvider.NAVER);
        assertThat(event.occurredAt()).isEqualTo(NOW);
        assertThat(event.actions()).containsExactly(new VerifiedOAuthSecurityEvent.Action("naver-한글-subject", true));
        assertThat(event.eventId()).isEqualTo(verifier.verify(request).eventId()).hasSize(64)
                .doesNotContain("naver-한글-subject", SECRET);
    }

    @Test
    void wrongClientAndMacAreRejectedBeforeCbcPaddingCanBeObserved() throws Exception {
        Map<String, String> wrongClient = signed("subject", NOW);
        wrongClient.put("clientId", "other-client");
        assertRejected(wrongClient, HttpStatus.FORBIDDEN);

        Map<String, String> malformedCiphertext = signed("subject", NOW);
        malformedCiphertext.put("encryptUniqueId", "A".repeat(43));
        assertRejected(malformedCiphertext, HttpStatus.FORBIDDEN);
        sign(malformedCiphertext);
        assertRejected(malformedCiphertext, HttpStatus.BAD_REQUEST);
    }

    @Test
    void canonicalSignatureEncodingPreventsEquivalentBase64AliasesFromChangingTheReplayKey() throws Exception {
        Map<String, String> request = signed("subject", NOW);
        String signature = request.get("signature");
        String alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        int last = alphabet.indexOf(signature.charAt(42));
        String alias = signature.substring(0, 42) + alphabet.charAt(last | 1);
        assertThat(Base64.getUrlDecoder().decode(alias)).isEqualTo(Base64.getUrlDecoder().decode(signature));
        request.put("signature", alias);
        assertRejected(request, HttpStatus.FORBIDDEN);
    }

    @Test
    void requestTimeReplayPolicyAllowsFiveMinutesButRejectsOlderOrFutureRequestsAndInvalidSubjects() throws Exception {
        verifier.verify(signed("subject", NOW.minusSeconds(300)));
        verifier.verify(signed("subject", NOW.plusSeconds(300)));
        assertRejected(signed("subject", NOW.minusSeconds(301)), HttpStatus.BAD_REQUEST);
        assertRejected(signed("subject", NOW.plusSeconds(301)), HttpStatus.BAD_REQUEST);
        assertRejected(signed("x".repeat(256), NOW), HttpStatus.BAD_REQUEST);
        assertRejected(signed("subject\n", NOW), HttpStatus.BAD_REQUEST);
        Map<String, String> extra = signed("subject", NOW);
        extra.put("email", "unused@example.invalid");
        assertRejected(extra, HttpStatus.BAD_REQUEST);
    }

    @Test
    void disabledReceiverAndMissingClientCredentialsDoNotEnableAnUnauthenticatedCallback() {
        assertThatThrownBy(() -> new NaverUnlinkEventVerifier(false, "", "", Clock.systemUTC()).verify(Map.of()))
                .isInstanceOfSatisfying(OAuthSecurityEventException.class,
                        failure -> assertThat(failure.status()).isEqualTo(HttpStatus.NOT_FOUND));
        assertThatThrownBy(() -> new NaverUnlinkEventVerifier(true, "", SECRET, Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new NaverUnlinkEventVerifier(true, CLIENT, "", Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
    }

    private Map<String, String> signed(String subject, Instant time) throws Exception {
        byte[] iv = new byte[16];
        for (int i = 0; i < iv.length; i++) iv[i] = (byte) (i + 1);
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new IvParameterSpec(iv));
        byte[] encrypted = cipher.doFinal(subject.getBytes(StandardCharsets.UTF_8));
        byte[] encoded = new byte[iv.length + encrypted.length];
        System.arraycopy(iv, 0, encoded, 0, iv.length);
        System.arraycopy(encrypted, 0, encoded, iv.length, encrypted.length);
        Map<String, String> values = new LinkedHashMap<>();
        values.put("clientId", CLIENT);
        values.put("encryptUniqueId", Base64.getUrlEncoder().withoutPadding().encodeToString(encoded));
        values.put("timestamp", Long.toString(time.getEpochSecond()));
        sign(values);
        return values;
    }

    private void sign(Map<String, String> values) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key(), "HmacSHA256"));
        String base = "clientId=" + values.get("clientId") + "&encryptUniqueId=" + values.get("encryptUniqueId")
                + "&timestamp=" + values.get("timestamp");
        values.put("signature", Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal(base.getBytes(StandardCharsets.UTF_8))));
    }

    private byte[] key() throws Exception {
        return MessageDigest.getInstance("MD5").digest(SECRET.getBytes(StandardCharsets.UTF_8));
    }

    private void assertRejected(Map<String, String> values, HttpStatus status) {
        assertThatThrownBy(() -> verifier.verify(values)).isInstanceOfSatisfying(OAuthSecurityEventException.class,
                failure -> assertThat(failure.status()).isEqualTo(status));
    }
}
