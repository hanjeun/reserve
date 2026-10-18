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
 * Public synthetic vectors generated once with Git's OpenSSL 3.5.4, independently of the Java verifier.
 * These are not provider-issued vectors and contain no real credentials.
 * Protocol: https://developers.naver.com/docs/login/devguide/devguide.md
 *
 * UTF-8 SECRET through {@code openssl dgst -md5 -binary} gives raw key 6c34e587490c0bc658f7c2186c1995c9.
 * {@code openssl enc -aes-128-cbc -nosalt -K <key> -iv 000102030405060708090a0b0c0d0e0f}
 * encrypts the UTF-8 subject with default block padding; prepend that IV and encode as unpadded Base64url.
 * {@code openssl dgst -sha256 -mac HMAC -macopt hexkey:<key> -binary} signs the UTF-8 string
 * {@code clientId=CLIENT&encryptUniqueId=CIPHERTEXT&timestamp=TIMESTAMP}, again encoded as unpadded Base64url.
 * INVALID_PADDING flips C1[15] by 0x0c, forcing the final plaintext padding byte from 0x0c to zero.
 * INVALID_UTF8 encrypts the two bytes c3 28 with valid block padding. Both error fixtures have valid MACs.
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
