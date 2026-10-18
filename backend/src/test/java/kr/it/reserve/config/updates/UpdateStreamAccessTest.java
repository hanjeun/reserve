package kr.it.reserve.config.updates;

import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.Test;
import java.time.LocalDateTime;
import java.util.Optional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class UpdateStreamAccessTest {
    @Test
    void deletedSuspendedPendingSignupRoleAndAuthVersionChangesInvalidateTheOriginalIdentity() {
        MemberRepository members = mock(MemberRepository.class);
        UpdateStreamAccess access = new UpdateStreamAccess(members, mock(TokenProvider.class, CALLS_REAL_METHODS));
        var member = EntityUpdateStreamTest.member(1, Role.USER);
        var original = UpdateStreamAccess.identity(member);
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));
        assertThat(access.current(original)).isTrue();
        member.rotateAuthVersion();
        assertThat(access.current(original)).isFalse();
        member.setAuthVersion(0);
        member.setRole(Role.ADMIN);
        assertThat(access.current(original)).isFalse();
        member.setRole(Role.USER);
        member.setTermsAgreed(false);
        assertThat(access.current(original)).isFalse();
        member.setTermsAgreed(true);
        member.ban("test");
        assertThat(access.current(original)).isFalse();
        member.unban();
        member.setDeletedAt(LocalDateTime.now());
        assertThat(access.current(original)).isFalse();
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.empty());
        assertThat(access.current(original)).isFalse();
    }

    @Test
    void aDelayedCutoffRejectsOnlyTheOldOAuthConnectionAndLegacyContextEvenAfterANewerLogin() {
        MemberRepository members = mock(MemberRepository.class);
        UpdateStreamAccess access = new UpdateStreamAccess(members, mock(TokenProvider.class, CALLS_REAL_METHODS));
        var member = EntityUpdateStreamTest.member(1, Role.USER);
        member.setProvider(AuthProvider.NAVER);
        LocalDateTime oldAuthentication = LocalDateTime.of(2026, 10, 16, 8, 0);
        LocalDateTime cutoff = oldAuthentication.plusMinutes(1);
        LocalDateTime newAuthentication = cutoff.plusNanos(500_000_000);
        member.setOauthAuthenticatedAt(newAuthentication);
        var oldConnection = UpdateStreamAccess.identity(member, oldAuthentication);
        var newConnection = UpdateStreamAccess.identity(member, newAuthentication);
        var legacyConnection = UpdateStreamAccess.identity(member);
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));
        assertThat(access.current(oldConnection)).isTrue();
        assertThat(access.current(legacyConnection)).isTrue();

        member.recordOAuthSecurityRevocation(cutoff);

        assertThat(member.getAuthVersion()).isZero();
        assertThat(oldConnection.oauthAuthenticatedAt()).isEqualTo(oldAuthentication);
        assertThat(access.current(oldConnection)).isFalse();
        assertThat(access.current(UpdateStreamAccess.identity(member, cutoff))).isFalse();
        assertThat(access.current(legacyConnection)).isFalse();
        assertThat(access.current(newConnection)).isTrue();
    }

    @Test
    void waitingKeepsItsExistingTermsPolicyAndLocalSessionsDoNotAcquireAnOAuthCutoff() {
        MemberRepository members = mock(MemberRepository.class);
        UpdateStreamAccess access = new UpdateStreamAccess(members, mock(TokenProvider.class, CALLS_REAL_METHODS));
        var member = EntityUpdateStreamTest.member(1, Role.USER);
        member.setProvider(AuthProvider.LOCAL);
        member.setTermsAgreed(false);
        member.recordOAuthSecurityRevocation(LocalDateTime.of(2026, 10, 16, 8, 0));
        when(members.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));

        assertThat(UpdateStreamAccess.identity(member, null)).isNull();
        assertThat(access.current(UpdateStreamAccess.waitingIdentity(member, null))).isTrue();
    }
}
