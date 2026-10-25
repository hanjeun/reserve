package kr.it.reserve.config.oauth2.events;

import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

/**
 * Java 검증기와 독립적으로 OpenSSL 3.5.4에서 만든 합성 벡터이며 제공자 발급 값이나 실제 자격정보가 아니다.
 * 규격: https://developers.naver.com/docs/login/devguide/devguide.md
 * UTF-8 비밀값의 MD5로 AES-128-CBC 키를 만들고 IV를 앞에 붙인 뒤 패딩 없는 Base64url로 인코딩한다.
 * clientId·encryptUniqueId·timestamp 문자열에 HMAC-SHA256을 적용한다.
 * 잘못된 패딩·UTF-8 벡터도 유효한 MAC을 가져 복호화 이후 검증을 확인한다.
 */
class NaverUnlinkProtocolBoundaryTest {
    private static final String CLIENT = "public-synthetic-client";
    private static final String SECRET = "public-synthetic-secret-not-a-credential";
    private static final String SUBJECT = "public-naver-subject";
    private static final Instant NOW = Instant.parse("2026-10-18T01:00:00Z");
    private static final String TIMESTAMP = "1792285200";
    private static final String VALID_CIPHERTEXT =
            "AAECAwQFBgcICQoLDA0OD5SnnRE3tJBvPdT7V7DB4W0llWkzPjA1hLDOQuCO5ndt";
    private static final String VALID_SIGNATURE = "n_8quL32wT9BiEJC23LOkCG_iQUGb_k7w0I41VyqK20";
    private static final String INVALID_PADDING_CIPHERTEXT =
            "AAECAwQFBgcICQoLDA0OD5SnnRE3tJBvPdT7V7DB4WEllWkzPjA1hLDOQuCO5ndt";
    private static final String INVALID_PADDING_SIGNATURE = "4x7IhgFdhSRiyWY2qKZD8bNg1_lj1QJZ_V4OfSuOD-Y";
    private static final String INVALID_UTF8_CIPHERTEXT = "AAECAwQFBgcICQoLDA0OD1VqgnR74jkVF9DNS9kxMQk";
    private static final String INVALID_UTF8_SIGNATURE = "QQWnQ0rLtkSIn7Vv6aRLzpBbkVcrJhHF9yEZE-hUwlc";

    private final OAuthSecurityEventService service = mock(OAuthSecurityEventService.class);
    private final NaverUnlinkEventController controller = new NaverUnlinkEventController(
            new NaverUnlinkEventVerifier(true, CLIENT, SECRET, Clock.fixed(NOW, ZoneOffset.UTC)), service);

    @Test
    void independentOpenSslVectorReachesStorageAsTheExactSubjectBeforeAnEmptyAcknowledgement() {
        ResponseEntity<Void> response = controller.receive(request(VALID_CIPHERTEXT, VALID_SIGNATURE));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(response.getBody()).isNull();
        ArgumentCaptor<VerifiedOAuthSecurityEvent> stored = ArgumentCaptor.forClass(VerifiedOAuthSecurityEvent.class);
        verify(service).receive(stored.capture());
        assertThat(stored.getValue().provider()).isEqualTo(AuthProvider.NAVER);
        assertThat(stored.getValue().occurredAt()).isEqualTo(NOW);
        assertThat(stored.getValue().actions()).containsExactly(new VerifiedOAuthSecurityEvent.Action(SUBJECT, true));
    }

    @Test
    void badMacIsRejectedBeforeEitherPaddingOrUtf8FailureCanAffectTheResponse() {
        assertEmptyRejection(INVALID_PADDING_CIPHERTEXT, VALID_SIGNATURE, HttpStatus.FORBIDDEN);
        assertEmptyRejection(INVALID_UTF8_CIPHERTEXT, VALID_SIGNATURE, HttpStatus.FORBIDDEN);

        verifyNoInteractions(service);
    }

    @Test
    void authenticatedPaddingAndUtf8FailuresHaveTheSameEmpty400WithoutReachingStorage() {
        ResponseEntity<Void> padding = assertEmptyRejection(
                INVALID_PADDING_CIPHERTEXT, INVALID_PADDING_SIGNATURE, HttpStatus.BAD_REQUEST);
        ResponseEntity<Void> utf8 = assertEmptyRejection(
                INVALID_UTF8_CIPHERTEXT, INVALID_UTF8_SIGNATURE, HttpStatus.BAD_REQUEST);

        assertThat(utf8.getHeaders()).isEqualTo(padding.getHeaders());
        verifyNoInteractions(service);
    }

    private ResponseEntity<Void> assertEmptyRejection(String ciphertext, String signature, HttpStatus status) {
        ResponseEntity<Void> response = controller.receive(request(ciphertext, signature));
        assertThat(response.getStatusCode()).isEqualTo(status);
        assertThat(response.getBody()).isNull();
        return response;
    }

    private MockHttpServletRequest request(String ciphertext, String signature) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/oauth/events/naver");
        request.setContentType("application/x-www-form-urlencoded");
        String body = "clientId=" + CLIENT + "&encryptUniqueId=" + ciphertext
                + "&timestamp=" + TIMESTAMP + "&signature=" + signature;
        request.setContent(body.getBytes(StandardCharsets.UTF_8));
        return request;
    }
}
