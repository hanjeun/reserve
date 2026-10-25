package kr.it.reserve.config;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TokenProviderLifecycleTest {
    private JwtSessionFixture fixture;
    private Member member;
    private String token;
    @BeforeEach void setUp() {
        member = Member.builder().id(1L).name("시험").email("lifecycle@example.test").password("synthetic-hash")
                .provider(AuthProvider.LOCAL).role(Role.USER).build();
        fixture = new JwtSessionFixture(member);
        token = fixture.issue(null).accessToken();
        clearInvocations(fixture.members, fixture.sessions);
    }
    @Test void accessAuthenticationParsesOnceAndUsesOneJoinedLookupWithTheCurrentRole() {
        JwtParser parser = spy((JwtParser) ReflectionTestUtils.getField(fixture.tokens, "parser"));
        ReflectionTestUtils.setField(fixture.tokens, "parser", parser);
        String sid = fixture.devices.values().iterator().next().getSessionId();
        member.setRole(Role.ADMIN);

        var verified = fixture.tokens.verifyAuthentication(token);

        assertThat(verified.member()).isSameAs(member);
        assertThat(verified.member().getRole()).isEqualTo(Role.ADMIN);
        assertThat(verified.sessionId()).isEqualTo(sid);
        verify(parser).parseSignedClaims(token);
        verify(fixture.sessions).findAuthenticationBySessionIdAndMemberId(sid, member.getId());
        verifyNoMoreInteractions(fixture.members, fixture.sessions);
    }
    @Test void revocationIsReadAgainInsteadOfReusingAnEarlierVerifiedSession() {
        assertThat(fixture.tokens.verifyAuthentication(token).member()).isSameAs(member);
        String sid = fixture.devices.values().iterator().next().getSessionId();
        fixture.devices.clear();

        assertThat(fixture.tokens.validToken(token)).isTrue();
        assertThatThrownBy(() -> fixture.tokens.verifyAuthentication(token)).isInstanceOf(AuthException.class);
        verify(fixture.sessions, times(2)).findAuthenticationBySessionIdAndMemberId(sid, member.getId());
        verifyNoInteractions(fixture.members);
    }
    @ParameterizedTest @ValueSource(strings = {"expiresAt", "absoluteExpiresAt"})
    void aStillSignedAccessTokenCannotOutliveEitherSessionDeadline(String field) {
        var session = fixture.devices.values().iterator().next();
        ReflectionTestUtils.setField(session, field, LocalDateTime.ofInstant(fixture.startedAt, ZoneOffset.UTC));
        assertThat(fixture.tokens.validToken(token)).isTrue();
        assertThatThrownBy(() -> fixture.tokens.verifyAuthentication(token)).isInstanceOf(AuthException.class);
    }
    @ParameterizedTest @ValueSource(strings = {"authVersion", "loginMethod", "oauthAuthenticatedAt", "absoluteExpiresAt"})
    void signedContextMustStillMatchTheJoinedDeviceSession(String field) {
        var session = fixture.devices.values().iterator().next();
        Object changed = switch (field) {
            case "authVersion" -> 1;
            case "loginMethod" -> "OAUTH";
            case "oauthAuthenticatedAt" -> LocalDateTime.ofInstant(fixture.startedAt, ZoneOffset.UTC);
            case "absoluteExpiresAt" -> session.getAbsoluteExpiresAt().plusSeconds(1);
            default -> throw new IllegalArgumentException(field);
        };
        ReflectionTestUtils.setField(session, field, changed);
        assertThat(fixture.tokens.validToken(token)).isTrue();
        assertThatThrownBy(() -> fixture.tokens.verifyAuthentication(token)).isInstanceOf(AuthException.class);
    }
    @Test void suspendedAndBannedMembersCannotReuseAnExistingAccessToken() {
        member.suspend(LocalDateTime.now().plusDays(1), "시험");
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(token)).isInstanceOf(AuthException.class);
        member.ban("시험");
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(token)).isInstanceOf(AuthException.class);
    }
    @Test void expiredSuspensionCanAuthenticate() {
        member.suspend(LocalDateTime.now().minusMinutes(1), "시험");
        assertThat(fixture.tokens.getActiveMemberFromToken(token)).isSameAs(member);
    }
    @Test void passwordChangeAndDeletionImmediatelyInvalidateAnExistingAccessToken() {
        member.rotateAuthVersion();
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(token)).isInstanceOf(AuthException.class);
        member.setAuthVersion(0);
        member.setDeletedAt(LocalDateTime.now());
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(token)).isInstanceOf(AuthException.class);
    }
    @ParameterizedTest @NullAndEmptySource @ValueSource(strings = "another-issuer")
    void rejectsForeignIssuerBeforeMemberLookupEvenOnExpiredRefresh(String issuer) {
        for (long offset : new long[]{60_000, -60_000}) {
            String foreign = Jwts.builder().issuer(issuer).expiration(new Date(fixture.startedAt.toEpochMilli() + offset))
                    .claim("id", 1L).claim("purpose", "REFRESH")
                    .signWith(Keys.hmacShaKeyFor(JwtSessionFixture.SECRET.getBytes(StandardCharsets.UTF_8))).compact();
            assertThat(fixture.tokens.validToken(foreign)).isFalse();
            assertThat(fixture.tokens.inspectRefreshToken(foreign).state()).isEqualTo(TokenProvider.RefreshTokenState.INVALID);
            assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(foreign)).isInstanceOf(JwtException.class);
        }
        verifyNoInteractions(fixture.members, fixture.sessions);
    }
    @Test void purposeAndAudienceAreEnforcedIndependentlyOfTheSignature() {
        var pair = fixture.issue(null);
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(pair.refreshToken()))
                .isInstanceOf(AuthException.class).hasMessageContaining("접근 토큰");
        assertThat(fixture.tokens.isRefreshToken(pair.accessToken())).isFalse();
        Claims claims = fixture.claims(token);
        String wrongAudience = Jwts.builder().claims(claims).audience().clear().add("test-issuer:refresh").and()
                .signWith(Keys.hmacShaKeyFor(JwtSessionFixture.SECRET.getBytes(StandardCharsets.UTF_8))).compact();
        assertThatThrownBy(() -> fixture.tokens.verifyAuthentication(wrongAudience)).isInstanceOf(JwtException.class);
    }
    @Test void anUnregisteredSidAndLegacySidlessAccessCannotAuthenticate() {
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(fixture.tokens.generateAccessToken(member)))
                .isInstanceOf(AuthException.class);
        String legacy = Jwts.builder().issuer("test-issuer").subject(member.getEmail())
                .expiration(Date.from(fixture.startedAt.plusSeconds(300))).claim("id", 1L).claim("purpose", "ACCESS")
                .signWith(Keys.hmacShaKeyFor(JwtSessionFixture.SECRET.getBytes(StandardCharsets.UTF_8))).compact();
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(legacy)).isInstanceOf(AuthException.class)
                .hasMessage(TokenProvider.RELOGIN_AFTER_UPDATE);
    }
    @Test void anotherHmacAlgorithmIsRejectedEvenWithTheSameSecretAndValidPayload() {
        String otherAlgorithm = Jwts.builder().claims(fixture.claims(token))
                .signWith(new javax.crypto.spec.SecretKeySpec(JwtSessionFixture.SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"),
                        Jwts.SIG.HS256).compact();
        assertThat(fixture.tokens.validToken(otherAlgorithm)).isFalse();
        assertThatThrownBy(() -> fixture.tokens.verifyAuthentication(otherAlgorithm)).isInstanceOf(JwtException.class);
        verifyNoInteractions(fixture.members, fixture.sessions);
    }
    @Test void delayedProviderCutoffUsesOriginalAuthenticationEvenAfterAnotherLogin() {
        LocalDateTime cutoff = LocalDateTime.ofInstant(fixture.startedAt.minusSeconds(30), ZoneOffset.UTC);
        member.setProvider(AuthProvider.GOOGLE); member.setProviderId("synthetic-provider");
        var old = fixture.issue(cutoff.minusMinutes(1));
        var fresh = fixture.issue(cutoff.plusNanos(500_000_000));
        member.setOauthAuthenticatedAt(cutoff.plusNanos(500_000_000));
        member.recordOAuthSecurityRevocation(cutoff);
        assertThat(fixture.tokens.validToken(old.accessToken())).isTrue();
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(old.accessToken())).isInstanceOf(AuthException.class);
        assertThat(fixture.tokens.getOAuthAuthenticationAt(fresh.accessToken())).isEqualTo(cutoff.plusNanos(500_000_000));
        assertThat(fixture.tokens.getActiveMemberFromToken(fresh.accessToken())).isSameAs(member);
    }
    @Test void theSixthDeviceEvictsTheOldestFamilyAndImmediatelyRevokesItsAccess() {
        var oldest = fixture.issue(null);
        for (int i = 0; i < 4; i++) fixture.issue(null);
        clearInvocations(fixture.members, fixture.sessions);
        fixture.issue(null);
        var order = inOrder(fixture.members, fixture.sessions);
        order.verify(fixture.members).findActiveByIdForUpdate(1L);
        order.verify(fixture.sessions).save(any());
        order.verify(fixture.sessions).findByMemberIdForUpdate(1L);
        order.verify(fixture.sessions).delete(any());
        assertThat(fixture.devices).hasSize(5);
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(oldest.accessToken())).isInstanceOf(AuthException.class);
    }
    @Test void aPasswordChangeBetweenCredentialCheckAndIssuanceCannotMintANewSession() {
        Member stale = Member.builder().id(1L).password("old-hash").role(Role.USER).build();
        member.rotateAuthVersion();
        clearInvocations(fixture.sessions);
        assertThatThrownBy(() -> fixture.tokens.issueSession(stale, null)).isInstanceOf(AuthException.class);
        verifyNoInteractions(fixture.sessions);
    }
}
