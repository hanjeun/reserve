package kr.it.reserve.config.oauth2.events;

import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSObject;
import com.nimbusds.jose.Payload;
import com.nimbusds.jose.crypto.RSASSASigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateKey;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.LinkedHashMap;
import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class OAuthSecurityEventVerifierTest {
    private static final Instant NOW = Instant.parse("2026-10-16T01:00:00Z");
    private static final String GOOGLE = "https://accounts.google.com";
    private static final String KAKAO = "https://kauth.kakao.com";
    private static final String OAUTH = "https://schemas.openid.net/secevent/oauth/event-type/";
    private static final String RISC = "https://schemas.openid.net/secevent/risc/event-type/";
    private static KeyPair pair;
    private OAuthSecurityEventKeys keys;
    private OAuthSecurityEventVerifier verifier;

    @BeforeAll
    static void createSigningKey() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        pair = generator.generateKeyPair();
    }

    @BeforeEach
    void setUp() {
        keys = mock(OAuthSecurityEventKeys.class);
        when(keys.resolve(AuthProvider.GOOGLE, "test-key")).thenReturn(
                new OAuthSecurityEventKeys.VerificationKey(GOOGLE, (RSAPublicKey) pair.getPublic()));
        when(keys.resolve(AuthProvider.KAKAO, "test-key")).thenReturn(
                new OAuthSecurityEventKeys.VerificationKey(KAKAO, (RSAPublicKey) pair.getPublic()));
        verifier = new OAuthSecurityEventVerifier(keys, true, "google-client", true, "kakao-rest", "123",
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void googleSignedHistoricalSessionEventIsAcceptedWithoutTreatingSetAsExpiringLoginJwt() throws Exception {
        JWTClaimsSet claims = claims(GOOGLE, "google-client", RISC + "sessions-revoked", GOOGLE).issueTime(
                Date.from(NOW.minusSeconds(3600))).expirationTime(Date.from(NOW.minusSeconds(1800))).build();

        VerifiedOAuthSecurityEvent event = verifier.verify(AuthProvider.GOOGLE, signed(claims));

        assertThat(event.eventId()).isEqualTo("event-1");
        assertThat(event.actions()).containsExactly(new VerifiedOAuthSecurityEvent.Action("provider-subject", false));
    }

    @Test
    void googleVerificationKeepsOnlyTheStateHashAndDoesNotRevokeAnySubject() throws Exception {
        JWTClaimsSet claims = claims(GOOGLE, "google-client", RISC + "verification", GOOGLE)
                .claim("events", Map.of(RISC + "verification", Map.of("state", "reserve-stream-check"))).build();

        VerifiedOAuthSecurityEvent event = verifier.verify(AuthProvider.GOOGLE, signed(claims));

        assertThat(event.actions()).isEmpty();
        assertThat(event.verificationStateHash())
                .isEqualTo("3d4247de690d5b50eee13a63832ce1befa5f7e7976c3f8b7000bd0f0e3d0f1fe");
        assertThat(event.toString()).doesNotContain("reserve-stream-check");
    }

    @Test
    void googleVerificationRejectsMissingNonStringOrUnboundedState() throws Exception {
        for (Map<String, Object> payload : List.of(Map.<String, Object>of(), Map.<String, Object>of("state", 123),
                Map.<String, Object>of("state", " "), Map.<String, Object>of("state", "a".repeat(513)))) {
            assertRejected(AuthProvider.GOOGLE, signed(claims(GOOGLE, "google-client", RISC + "verification", GOOGLE)
                    .claim("events", Map.of(RISC + "verification", payload)).build()), "invalid_request");
        }
    }

    @Test
    void kakaoUnlinkClearsOnlyTheMatchingProviderTokenAndSessions() throws Exception {
        String token = signed(claims(KAKAO, "kakao-rest", OAUTH + "user-unlinked", KAKAO)
                .subject("provider-subject").claim("app_id", "123").claim("toe", NOW.minusSeconds(30).getEpochSecond()).build());

        VerifiedOAuthSecurityEvent event = verifier.verify(AuthProvider.KAKAO, token);

        assertThat(event.occurredAt()).isEqualTo(NOW.minusSeconds(30));
        assertThat(event.actions()).containsExactly(new VerifiedOAuthSecurityEvent.Action("provider-subject", true));
    }

    @Test
    void wrongAudienceIssuerAndAppIdAreRejectedBeforeAnyMemberProcessing() throws Exception {
        assertRejected(AuthProvider.GOOGLE, signed(claims(GOOGLE, "another-client", RISC + "sessions-revoked", GOOGLE).build()), "invalid_audience");
        assertRejected(AuthProvider.GOOGLE, signed(claims("https://attacker.invalid", "google-client", RISC + "sessions-revoked", GOOGLE).build()), "invalid_issuer");
        assertRejected(AuthProvider.KAKAO, signed(claims(KAKAO, "kakao-rest", OAUTH + "user-unlinked", KAKAO)
                .subject("provider-subject").claim("app_id", "different-app").build()), "invalid_audience");
    }

    @Test
    void unsignedOrWrongKeyTokensCannotCauseRevocation() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        SignedJWT jwt = new SignedJWT(header(), claims(GOOGLE, "google-client", RISC + "sessions-revoked", GOOGLE).build());
        jwt.sign(new RSASSASigner((RSAPrivateKey) generator.generateKeyPair().getPrivate()));
        assertRejected(AuthProvider.GOOGLE, jwt.serialize(), "invalid_key");
        assertRejected(AuthProvider.GOOGLE, "eyJhbGciOiJub25lIn0.e30.", "invalid_request");
    }

    @Test
    void emailSubjectAndMismatchedKakaoSubjectCannotIdentifyAMember() throws Exception {
        JWTClaimsSet google = claims(GOOGLE, "google-client", RISC + "sessions-revoked", GOOGLE)
                .claim("events", Map.of(RISC + "sessions-revoked", Map.of("subject", Map.of(
                        "subject_type", "email", "email", "someone@example.test")))).build();
        assertRejected(AuthProvider.GOOGLE, signed(google), "invalid_request");
        assertRejected(AuthProvider.KAKAO, signed(claims(KAKAO, "kakao-rest", OAUTH + "user-unlinked", KAKAO)
                .subject("different-subject").claim("app_id", "123").build()), "invalid_request");
    }

    @Test
    void accountEnabledScopeWithdrawalBusinessTokensAndUnknownEventsAreNotAccountDeletion() throws Exception {
        for (String type : List.of(RISC + "account-enabled", OAUTH + "user-scope-withdraw", "https://unknown.invalid/event")) {
            assertThat(verifier.verify(AuthProvider.GOOGLE,
                    signed(claims(GOOGLE, "google-client", type, GOOGLE).build())).actions()).isEmpty();
        }
        JWTClaimsSet business = claims(KAKAO, "kakao-rest", OAUTH + "tokens-revoked", KAKAO)
                .subject("provider-subject").claim("app_id", "123")
                .claim("events", Map.of(OAUTH + "tokens-revoked", Map.of("token_class", "business"))).build();
        assertThat(verifier.verify(AuthProvider.KAKAO, signed(business)).actions()).isEmpty();
    }

    @Test
    void disabledReceiverDoesNotFetchKeysAndEnabledReceiverRequiresAudience() {
        OAuthSecurityEventVerifier disabled = new OAuthSecurityEventVerifier(keys, false, "", false, "", "", Clock.systemUTC());
        assertThatThrownBy(() -> disabled.verify(AuthProvider.GOOGLE, "anything"))
                .isInstanceOf(OAuthSecurityEventException.class).hasMessage("receiver_disabled");
        assertThatThrownBy(() -> new OAuthSecurityEventVerifier(keys, true, "", false, "", "", Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> new OAuthSecurityEventVerifier(keys, false, "", true, "kakao-rest", "", Clock.systemUTC()))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(keys);
    }

    @Test
    void validAudienceConfigurationCanEnableReceiversWithTheSharedSubjectBarrier() {
        assertThat(new OAuthSecurityEventVerifier(keys, true, "google-client", true, "kakao-rest", "123", Clock.systemUTC()))
                .isNotNull();
    }

    @Test
    void missingEventIdFutureIssuanceAndOversizedBodyAreRejected() throws Exception {
        assertRejected(AuthProvider.GOOGLE, signed(claims(GOOGLE, "google-client", RISC + "sessions-revoked", GOOGLE)
                .jwtID(null).build()), "invalid_request");
        assertRejected(AuthProvider.GOOGLE, signed(claims(GOOGLE, "google-client", RISC + "sessions-revoked", GOOGLE)
                .issueTime(Date.from(NOW.plusSeconds(600))).build()), "invalid_request");
        assertRejected(AuthProvider.GOOGLE, "a".repeat(32769), "invalid_request");
    }

    @Test
    void fractionalSignedIatAndToeAreReadFromTheOriginalNumbersAndRoundedUpToMilliseconds() throws Exception {
        Map<String, Object> payload = new LinkedHashMap<>(claims(GOOGLE, "google-client", RISC + "sessions-revoked", GOOGLE)
                .build().toJSONObject());
        BigDecimal fractional = new BigDecimal(NOW.getEpochSecond() + ".5001");
        payload.put("iat", fractional);
        String fallbackToken = signedPayload(payload);
        Object rawIat = SignedJWT.parse(fallbackToken).getPayload().toJSONObject().get("iat");
        assertThat(rawIat).isInstanceOf(Number.class);
        assertThat(new BigDecimal(rawIat.toString())).isEqualByComparingTo(fractional);
        assertThat(verifier.verify(AuthProvider.GOOGLE, fallbackToken).occurredAt()).isEqualTo(NOW.plusMillis(501));

        payload.put("iat", NOW.plusSeconds(1).getEpochSecond());
        payload.put("toe", new BigDecimal(NOW.getEpochSecond() + ".4999"));
        String eventTimeToken = signedPayload(payload);
        Object rawToe = SignedJWT.parse(eventTimeToken).getPayload().toJSONObject().get("toe");
        assertThat(new BigDecimal(rawToe.toString())).isEqualByComparingTo(new BigDecimal(NOW.getEpochSecond() + ".4999"));
        assertThat(verifier.verify(AuthProvider.GOOGLE, eventTimeToken).occurredAt()).isEqualTo(NOW.plusMillis(500));
    }

    @Test
    void invalidNegativeOrOverflowingNumericDatesAreRejectedInsteadOfTruncated() throws Exception {
        for (Object invalid : List.of("not-a-number", new BigDecimal("-0.0001"), new BigDecimal("1e100"))) {
            Map<String, Object> payload = new LinkedHashMap<>(claims(GOOGLE, "google-client", RISC + "sessions-revoked", GOOGLE)
                    .build().toJSONObject());
            payload.put("iat", invalid);
            assertRejected(AuthProvider.GOOGLE, signedPayload(payload), "invalid_request");
            payload.put("iat", NOW.getEpochSecond());
            payload.put("toe", invalid);
            assertRejected(AuthProvider.GOOGLE, signedPayload(payload), "invalid_request");
        }
    }

    private void assertRejected(AuthProvider provider, String token, String code) {
        assertThatThrownBy(() -> verifier.verify(provider, token)).isInstanceOf(OAuthSecurityEventException.class).hasMessage(code);
    }

    private JWTClaimsSet.Builder claims(String issuer, String audience, String type, String subjectIssuer) {
        return new JWTClaimsSet.Builder().issuer(issuer).audience(audience).issueTime(Date.from(NOW)).jwtID("event-1")
                .claim("events", Map.of(type, Map.of("subject", Map.of(
                        "subject_type", "iss-sub", "iss", subjectIssuer, "sub", "provider-subject"))));
    }

    private JWSHeader header() {
        return new JWSHeader.Builder(JWSAlgorithm.RS256).keyID("test-key").type(new JOSEObjectType("secevent+jwt")).build();
    }

    private String signed(JWTClaimsSet claims) throws Exception {
        SignedJWT jwt = new SignedJWT(header(), claims);
        jwt.sign(new RSASSASigner((RSAPrivateKey) pair.getPrivate()));
        return jwt.serialize();
    }

    private String signedPayload(Map<String, Object> payload) throws Exception {
        JWSObject jwt = new JWSObject(header(), new Payload(payload));
        jwt.sign(new RSASSASigner((RSAPrivateKey) pair.getPrivate()));
        return jwt.serialize();
    }
}
