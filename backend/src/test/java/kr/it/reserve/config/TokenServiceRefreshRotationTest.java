package kr.it.reserve.config;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.service.RefreshRejectedException;
import kr.it.reserve.config.service.RefreshRejectedException.Reason;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicReference;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TokenServiceRefreshRotationTest {
    private JwtSessionFixture fixture;
    private Member member;
    @BeforeEach void setUp() {
        member = Member.builder().id(1L).name("회전 시험").email("rotation@example.test").password("synthetic-hash")
                .role(Role.USER).provider(AuthProvider.LOCAL).build();
        fixture = new JwtSessionFixture(member);
    }
    private void rejected(String token, Reason reason) {
        assertThatThrownBy(() -> fixture.service.refresh(token)).isInstanceOf(RefreshRejectedException.class)
                .extracting(error -> ((RefreshRejectedException) error).getReason()).isEqualTo(reason);
    }
    private TokenProvider.IssuedSession issue() { return fixture.issue(null); }

    @Test void rotatesSameDeviceWithoutStoringARawBearer() {
        var first = issue();
        RefreshToken row = fixture.row(first.refreshToken());
        clearInvocations(fixture.sessions);
        var next = fixture.service.refresh(first.refreshToken());
        assertThat(next.refreshToken()).isNotEqualTo(first.refreshToken());
        assertThat(first.toString()).doesNotContain(first.accessToken(), first.refreshToken());
        assertThat(next.toString()).doesNotContain(next.accessToken(), next.refreshToken());
        assertThat(row.getRefreshTokenHash()).isEqualTo(RefreshToken.hash(next.refreshToken()));
        assertThat(row.getPreviousTokenHash()).isEqualTo(RefreshToken.hash(first.refreshToken()));
        assertThat(row.getRotationVersion()).isEqualTo(1);
        assertThat(fixture.tokens.getSessionId(next.accessToken())).isEqualTo(row.getSessionId());
        assertThat(fixture.tokens.getActiveMemberFromToken(next.accessToken())).isSameAs(member);
        verify(fixture.sessions, never()).save(any());
        verify(fixture.sessions, never()).delete(any());
        assertThat(Arrays.stream(RefreshToken.class.getDeclaredFields()).map(java.lang.reflect.Field::getName))
                .doesNotContain("refreshToken");
    }
    @Test void tokensAreUniqueEvenInTheSameSecond() {
        assertThat(issue().refreshToken()).isNotEqualTo(issue().refreshToken());
    }
    @Test void previousTokenWithinGraceReturnsExactlyTheCurrentTokenWithoutAnotherRotation() {
        var first = issue();
        var current = fixture.service.refresh(first.refreshToken());
        fixture.setNow(fixture.startedAt.plusSeconds(59));
        assertThat(fixture.service.refresh(first.refreshToken()).refreshToken()).isEqualTo(current.refreshToken());
        assertThat(fixture.row(current.refreshToken()).getRotationVersion()).isEqualTo(1);
    }
    @Test void previousTokenAtTheGraceDeadlineRevokesAccessAndRefresh() {
        var first = issue();
        var current = fixture.service.refresh(first.refreshToken());
        fixture.setNow(fixture.startedAt.plusSeconds(60));
        rejected(first.refreshToken(), Reason.REUSED_TOKEN);
        rejected(current.refreshToken(), Reason.UNKNOWN_TOKEN);
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(current.accessToken())).isInstanceOf(AuthException.class);
    }
    @Test void aTokenTwoOrMoreGenerationsOldRevokesTheEntireDeviceFamily() {
        var first = issue();
        var second = fixture.service.refresh(first.refreshToken());
        var third = fixture.service.refresh(second.refreshToken());
        rejected(first.refreshToken(), Reason.REUSED_TOKEN);
        rejected(third.refreshToken(), Reason.UNKNOWN_TOKEN);
        assertThat(fixture.devices).isEmpty();
    }
    @Test void evenAnExpiredSignedOlderGenerationIdentifiesItsStillLiveFamily() {
        var first = issue();
        fixture.setNow(fixture.startedAt.plus(Duration.ofDays(13)));
        var second = fixture.service.refresh(first.refreshToken());
        var third = fixture.service.refresh(second.refreshToken());
        fixture.setNow(fixture.startedAt.plus(Duration.ofDays(15)));
        rejected(first.refreshToken(), Reason.REUSED_TOKEN);
        rejected(third.refreshToken(), Reason.UNKNOWN_TOKEN);
    }
    @Test void aRotationCommittedWhileWaitingIsReadAfterTheLock() {
        var first = issue();
        RefreshToken row = fixture.row(first.refreshToken());
        AtomicReference<String> committed = new AtomicReference<>();
        when(fixture.sessions.findBySessionIdForUpdate(row.getSessionId(), 1L)).thenAnswer(invocation -> {
            if (committed.get() == null) committed.set(fixture.tokens.rotateSession(row).refreshToken());
            return Optional.of(row);
        });
        assertThat(fixture.service.refresh(first.refreshToken()).refreshToken()).isEqualTo(committed.get());
        assertThat(row.getRotationVersion()).isEqualTo(1);
    }
    @Test void unregisteredSignedTokenCannotBecomeASession() {
        rejected(fixture.tokens.createRefreshJwt(member), Reason.UNKNOWN_TOKEN);
    }
    @Test void expiredDatabaseSessionIsDeleted() {
        var pair = issue();
        ReflectionTestUtils.setField(fixture.row(pair.refreshToken()), "expiresAt",
                LocalDateTime.ofInstant(fixture.startedAt.minusSeconds(1), ZoneOffset.UTC));
        rejected(pair.refreshToken(), Reason.EXPIRED_SESSION);
        assertThat(fixture.devices).isEmpty();
    }
    @Test void passwordChangeRejectsAndDeletesOldDevice() {
        var pair = issue();
        member.rotateAuthVersion();
        rejected(pair.refreshToken(), Reason.AUTH_VERSION_CHANGED);
        assertThat(fixture.devices).isEmpty();
    }
    @Test void missingMemberRejectsAndDeletesOldDevice() {
        var pair = issue();
        when(fixture.members.findActiveByIdForUpdate(1L)).thenReturn(Optional.empty());
        rejected(pair.refreshToken(), Reason.MEMBER_UNAVAILABLE);
        assertThat(fixture.devices).isEmpty();
    }
    @Test void forgeryAndPurposeConfusionAreRejectedBeforeDatabaseLookups() {
        String valid = fixture.tokens.createRefreshJwt(member);
        String tampered = valid.substring(0, valid.length() - 2) + (valid.endsWith("AA") ? "BB" : "AA");
        clearInvocations(fixture.members, fixture.sessions);
        rejected(tampered, Reason.INVALID_JWT);
        rejected("not-a-jwt", Reason.INVALID_JWT);
        rejected(fixture.tokens.generateAccessToken(member), Reason.NOT_REFRESH_TOKEN);
        verifyNoInteractions(fixture.members, fixture.sessions);
    }
    @Test void sidlessLegacyTokensRequireOneNewLoginEvenWithAnOldDatabaseRow() {
        String legacy = Jwts.builder().issuer("test-issuer").subject(member.getEmail())
                .issuedAt(Date.from(fixture.startedAt)).expiration(Date.from(fixture.startedAt.plusSeconds(300)))
                .claim("id", 1L).claim("purpose", "REFRESH")
                .signWith(Keys.hmacShaKeyFor(JwtSessionFixture.SECRET.getBytes(StandardCharsets.UTF_8))).compact();
        rejected(legacy, Reason.LEGACY_SESSION);
        assertThat(fixture.devices).isEmpty();
    }
    @Test void expiredSuspensionIsLiftedButActiveSuspensionStillBlocksAccess() {
        var first = issue();
        member.suspend(LocalDateTime.now().minusMinutes(1), "시험");
        fixture.service.refresh(first.refreshToken());
        assertThat(member.isSuspended()).isFalse();
        verify(fixture.members).save(member);
        var second = issue();
        member.suspend(LocalDateTime.now().plusMinutes(10), "시험");
        var current = fixture.service.refresh(second.refreshToken());
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(current.accessToken())).isInstanceOf(AuthException.class);
    }
    @Test void logoutOfAnyGenerationImmediatelyRevokesOnlyThatDevicesAccess() {
        var first = issue();
        var other = issue();
        var second = fixture.service.refresh(first.refreshToken());
        fixture.service.refresh(second.refreshToken());
        fixture.service.revoke(first.refreshToken());
        assertThatThrownBy(() -> fixture.tokens.getActiveMemberFromToken(first.accessToken())).isInstanceOf(AuthException.class);
        assertThat(fixture.tokens.getActiveMemberFromToken(other.accessToken())).isSameAs(member);
        fixture.service.revoke("not-a-jwt");
        assertThat(fixture.devices).hasSize(1);
    }
    @Test void aGraceResponseDoesNotDependOnMutableEmailNameOrRole() {
        var first = issue();
        var current = fixture.service.refresh(first.refreshToken());
        member.setEmail("changed@example.test");
        member.setName("변경");
        member.setRole(Role.BUSINESS);
        var grace = fixture.service.refresh(first.refreshToken());
        assertThat(grace.refreshToken()).isEqualTo(current.refreshToken());
        assertThat(fixture.claims(grace.refreshToken()).getSubject()).isEqualTo("1");
        assertThat(fixture.claims(grace.refreshToken())).doesNotContainKeys("role");
        assertThat(fixture.tokens.getActiveMemberFromToken(grace.accessToken()).getRole()).isEqualTo(Role.BUSINESS);
    }
    @Test void metadataCorruptionCannotReturnANewUnregisteredBearerDuringGrace() {
        var first = issue();
        fixture.service.refresh(first.refreshToken());
        ReflectionTestUtils.setField(fixture.row(first.refreshToken()), "refreshJti", UUID.randomUUID().toString());
        rejected(first.refreshToken(), Reason.SESSION_INCONSISTENT);
        assertThat(fixture.devices).isEmpty();
    }
    @Test void rotationAndGracePreserveOriginalSocialProofAndRespectADelayedCutoff() {
        LocalDateTime original = LocalDateTime.ofInstant(fixture.startedAt.minusSeconds(120), ZoneOffset.UTC);
        member.setProvider(AuthProvider.GOOGLE); member.setProviderId("synthetic-provider-id");
        member.setOauthAuthenticatedAt(original);
        var first = fixture.issue(original);
        member.setOauthAuthenticatedAt(original.plusMinutes(1));
        var current = fixture.service.refresh(first.refreshToken());
        var grace = fixture.service.refresh(first.refreshToken());
        assertThat(fixture.tokens.getOAuthAuthenticationAt(current.accessToken())).isEqualTo(original);
        assertThat(fixture.tokens.getOAuthAuthenticationAt(grace.accessToken())).isEqualTo(original);
        member.recordOAuthSecurityRevocation(original.plusSeconds(30));
        rejected(current.refreshToken(), Reason.OAUTH_AUTHENTICATION_REVOKED);
        var fresh = fixture.issue(member.getOauthAuthenticatedAt());
        assertThat(fixture.tokens.getActiveMemberFromToken(fresh.accessToken())).isSameAs(member);
    }
    @Test void passwordSessionOnAHybridAccountNeverAcquiresSocialProofDuringRotation() {
        member.setProvider(AuthProvider.GOOGLE); member.setProviderId("synthetic-provider-id");
        member.setOauthAuthenticatedAt(LocalDateTime.ofInstant(fixture.startedAt, ZoneOffset.UTC));
        member.recordOAuthSecurityRevocation(member.getOauthAuthenticatedAt().minusSeconds(1));
        var first = fixture.issue(null);
        var current = fixture.service.refresh(first.refreshToken());
        assertThat(fixture.tokens.getLoginMethod(current.accessToken())).isEqualTo("PASSWORD");
        assertThat(fixture.tokens.getOAuthAuthenticationAt(current.accessToken())).isNull();
        member.setPassword(null);
        rejected(current.refreshToken(), Reason.OAUTH_AUTHENTICATION_REVOKED);
    }
    @Test void slidingRefreshNeverExtendsTheAbsoluteSessionLifetime() {
        var first = issue();
        fixture.setNow(fixture.startedAt.plus(Duration.ofDays(13)));
        var second = fixture.service.refresh(first.refreshToken());
        fixture.setNow(fixture.startedAt.plus(Duration.ofDays(26)));
        var last = fixture.service.refresh(second.refreshToken());
        assertThat(last.refreshMaxAge()).isEqualTo(Duration.ofDays(4));
        assertThat(fixture.claims(last.refreshToken()).getExpiration().toInstant()).isEqualTo(fixture.startedAt.plus(Duration.ofDays(30)));
        fixture.setNow(fixture.startedAt.plus(Duration.ofDays(30)));
        rejected(last.refreshToken(), Reason.EXPIRED_SESSION);
        assertThat(fixture.devices).isEmpty();
    }
    @Test void keyringRotationKeepsAnExactGraceResponseAndRejectsUnknownKid() {
        fixture.properties.getSigningKeys().put("old", JwtSessionFixture.SECRET + "-old");
        fixture.properties.getSigningKeys().put("new", JwtSessionFixture.SECRET + "-new");
        fixture.properties.setActiveKeyId("old"); fixture.tokens.init();
        var first = issue();
        fixture.properties.setActiveKeyId("new"); fixture.tokens.init();
        var current = fixture.service.refresh(first.refreshToken());
        assertThat(fixture.service.refresh(first.refreshToken()).refreshToken()).isEqualTo(current.refreshToken());
        String unknown = Jwts.builder().header().keyId("unknown").and().claims(fixture.claims(current.refreshToken()))
                .signWith(Keys.hmacShaKeyFor(JwtSessionFixture.SECRET.getBytes(StandardCharsets.UTF_8))).compact();
        rejected(unknown, Reason.INVALID_JWT);
    }
    @Test void revocationBeforeRejectionIsCommitted() throws Exception {
        Transactional tx = TokenService.class.getMethod("refresh", String.class).getAnnotation(Transactional.class);
        assertThat(Arrays.asList(tx.noRollbackFor())).contains(RefreshRejectedException.class);
    }
}
