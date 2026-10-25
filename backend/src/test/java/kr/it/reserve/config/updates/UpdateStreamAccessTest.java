package kr.it.reserve.config.updates;

import kr.it.reserve.config.JwtSessionFixture;
import kr.it.reserve.member.entity.*;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import static org.assertj.core.api.Assertions.*;

class UpdateStreamAccessTest {
    private Member member() {
        return Member.builder().id(1L).email("stream@example.test").password("synthetic-hash").role(Role.USER)
                .provider(AuthProvider.LOCAL).termsAgreed(true).build();
    }
    @Test void deletionSuspensionTermsRoleAndAuthVersionInvalidateTheOriginalIdentity() {
        Member member = member();
        var fixture = new JwtSessionFixture(member);
        var pair = fixture.issue(null);
        var access = new UpdateStreamAccess(fixture.members, fixture.tokens);
        var original = UpdateStreamAccess.identity(member, null, "PASSWORD", fixture.tokens.getSessionId(pair.accessToken()));
        assertThat(access.current(original)).isTrue();
        member.rotateAuthVersion(); assertThat(access.current(original)).isFalse();
        member.setAuthVersion(0); member.setRole(Role.ADMIN); assertThat(access.current(original)).isFalse();
        member.setRole(Role.USER); member.setTermsAgreed(false); assertThat(access.current(original)).isFalse();
        member.setTermsAgreed(true); member.ban("test"); assertThat(access.current(original)).isFalse();
        member.unban(); member.setDeletedAt(LocalDateTime.now()); assertThat(access.current(original)).isFalse();
    }
    @Test void delayedCutoffRejectsOldSocialProofAndSidlessContextButKeepsAFreshFamily() {
        Member member = member();
        member.setProvider(AuthProvider.NAVER); member.setProviderId("synthetic-subject");
        var fixture = new JwtSessionFixture(member);
        LocalDateTime cutoff = LocalDateTime.ofInstant(fixture.startedAt.minusSeconds(30), ZoneOffset.UTC);
        LocalDateTime oldAt = cutoff.minusMinutes(1), newAt = cutoff.plusNanos(500_000_000);
        var old = fixture.issue(oldAt); var fresh = fixture.issue(newAt);
        member.setOauthAuthenticatedAt(newAt);
        var access = new UpdateStreamAccess(fixture.members, fixture.tokens);
        var oldIdentity = UpdateStreamAccess.identity(member, oldAt, "OAUTH", fixture.tokens.getSessionId(old.accessToken()));
        var newIdentity = UpdateStreamAccess.identity(member, newAt, "OAUTH", fixture.tokens.getSessionId(fresh.accessToken()));
        assertThat(access.current(oldIdentity)).isTrue();
        assertThat(access.current(UpdateStreamAccess.identity(member))).isFalse();
        member.recordOAuthSecurityRevocation(cutoff);
        assertThat(access.current(oldIdentity)).isFalse();
        assertThat(access.current(newIdentity)).isTrue();
    }
    @Test void waitingRetainsItsTermsPolicyAndLocalPasswordSessionsDoNotAcquireSocialProof() {
        Member member = member(); member.setTermsAgreed(false);
        var fixture = new JwtSessionFixture(member);
        var pair = fixture.issue(null);
        member.recordOAuthSecurityRevocation(LocalDateTime.now(ZoneOffset.UTC));
        String sid = fixture.tokens.getSessionId(pair.accessToken());
        var access = new UpdateStreamAccess(fixture.members, fixture.tokens);
        assertThat(UpdateStreamAccess.identity(member, null, "PASSWORD", sid)).isNull();
        assertThat(access.current(UpdateStreamAccess.waitingIdentity(member, null, "PASSWORD", sid))).isTrue();
    }
    @Test void newPasswordSessionSurvivesTheSocialCutoffButOldVersionsAndRemovedCredentialsDoNot() {
        Member member = member(); member.setProvider(AuthProvider.GOOGLE); member.setProviderId("synthetic-subject");
        var fixture = new JwtSessionFixture(member);
        LocalDateTime original = LocalDateTime.ofInstant(fixture.startedAt.minusSeconds(60), ZoneOffset.UTC);
        var old = fixture.issue(null);
        var oldIdentity = UpdateStreamAccess.identity(member, null, "PASSWORD", fixture.tokens.getSessionId(old.accessToken()));
        member.recordOAuthSecurityRevocation(original.plusSeconds(1)); member.rotateAuthVersion();
        var pair = fixture.issue(null);
        String sid = fixture.tokens.getSessionId(pair.accessToken());
        var current = UpdateStreamAccess.identity(member, null, "PASSWORD", sid);
        var access = new UpdateStreamAccess(fixture.members, fixture.tokens);
        assertThat(access.current(oldIdentity)).isFalse();
        assertThat(access.current(current)).isTrue();
        assertThat(access.current(UpdateStreamAccess.waitingIdentity(member, null, "PASSWORD", sid))).isTrue();
        assertThat(access.current(UpdateStreamAccess.identity(member, original, "OAUTH", sid))).isFalse();
        assertThat(access.current(UpdateStreamAccess.identity(member, null, "OAUTH", sid))).isFalse();
        assertThat(access.current(UpdateStreamAccess.identity(member, null, "UNKNOWN", sid))).isFalse();
        member.setPassword(null);
        assertThat(access.current(current)).isFalse();
    }
    @Test void loggingOutOneDeviceInvalidatesItsCapturedIdentityButKeepsAnotherDevice() {
        Member member = member();
        var fixture = new JwtSessionFixture(member);
        var first = fixture.issue(null); var second = fixture.issue(null);
        var firstIdentity = UpdateStreamAccess.identity(member, null, "PASSWORD", fixture.tokens.getSessionId(first.accessToken()));
        var secondIdentity = UpdateStreamAccess.identity(member, null, "PASSWORD", fixture.tokens.getSessionId(second.accessToken()));
        var access = new UpdateStreamAccess(fixture.members, fixture.tokens);
        assertThat(access.current(firstIdentity)).isTrue();
        fixture.service.revoke(first.refreshToken());
        assertThat(access.current(firstIdentity)).isFalse();
        assertThat(access.current(secondIdentity)).isTrue();
    }
}
