package kr.it.reserve.config.oauth2.subject;

import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

class OAuthSubjectSecurityTest {
    private static final Instant NOW = Instant.parse("2026-10-16T01:00:00Z");
    private static final LocalDateTime TIME = LocalDateTime.ofInstant(NOW, ZoneOffset.UTC);

    @Test
    void pseudonymousKeysKeepProviderNamespacesAndValidateBeforeAnyRepositoryWrite() {
        String google = OAuthSubjectSecurityService.subjectKey(AuthProvider.GOOGLE, "subject");
        assertThat(google).hasSize(64).matches("[0-9a-f]{64}");
        assertThat(google).isEqualTo(OAuthSubjectSecurityService.subjectKey(AuthProvider.GOOGLE, "subject"));
        assertThat(google).isNotEqualTo(OAuthSubjectSecurityService.subjectKey(AuthProvider.KAKAO, "subject"));
        assertThat(google).isNotEqualTo(OAuthSubjectSecurityService.subjectKey(AuthProvider.GOOGLE, "Subject"));
        assertThatThrownBy(() -> OAuthSubjectSecurityService.subjectKey(AuthProvider.LOCAL, "subject"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> OAuthSubjectSecurityService.subjectKey(AuthProvider.NAVER, " "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> OAuthSubjectSecurityService.subjectKey(AuthProvider.NAVER, "x".repeat(256)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void legacyHydrationKeepsMaximumKnownTimesAndNeverInventsAnAuthenticationForNull() {
        OAuthSubjectSecurity subject = new OAuthSubjectSecurity();
        subject.mergeMemberState(null, null);
        assertThat(subject.getLastAuthenticatedAt()).isNull();
        assertThat(subject.getRevokedAt()).isNull();
        subject.mergeMemberState(TIME, TIME.minusSeconds(60));
        subject.mergeMemberState(TIME.minusSeconds(30), null);
        subject.mergeMemberState(null, TIME.minusSeconds(90));
        assertThat(subject.getLastAuthenticatedAt()).isEqualTo(TIME);
        assertThat(subject.getRevokedAt()).isEqualTo(TIME.minusSeconds(60));
    }

    @Test
    void cutoffAndAuthenticationHighWaterMarksNeverMoveBackwardsOrAcceptTheSameRevocationSecond() {
        OAuthSubjectSecurity subject = new OAuthSubjectSecurity();
        subject.revoked(TIME, TIME);
        subject.revoked(TIME.minusSeconds(1), TIME);
        assertThat(subject.acceptsAuthentication(TIME)).isFalse();
        assertThat(subject.acceptsAuthentication(TIME.minusSeconds(1))).isFalse();
        subject.authenticated(TIME.plusSeconds(1), TIME.plusSeconds(1));
        assertThat(subject.getRevokedAt()).isEqualTo(TIME);
        assertThatThrownBy(() -> subject.authenticated(TIME, TIME.plusSeconds(2)))
                .isInstanceOf(IllegalStateException.class);
        assertThat(subject.getLastAuthenticatedAt()).isEqualTo(TIME.plusSeconds(1));
    }

    @Test
    void tokenExchangeTimeAndExpiryAreCheckedWithTenMinuteAgeAndSixtySecondFutureTolerance() {
        OAuthSubjectSecurityService service = new OAuthSubjectSecurityService(mock(OAuthSubjectSecurityRepository.class),
                Clock.fixed(NOW, ZoneOffset.UTC));
        service.requireFreshAuthentication(TIME.minusMinutes(10).plusSeconds(1), NOW.plusSeconds(1));
        service.requireFreshAuthentication(TIME.plusSeconds(60), NOW.plusSeconds(3600));
        assertRejected(service, TIME.minusMinutes(10), NOW.plusSeconds(3600));
        assertRejected(service, TIME.plusSeconds(61), NOW.plusSeconds(3600));
        assertRejected(service, TIME, NOW);
        assertRejected(service, TIME, null);
        assertRejected(service, null, NOW.plusSeconds(3600));
    }

    private void assertRejected(OAuthSubjectSecurityService service, LocalDateTime issuedAt, Instant expiresAt) {
        assertThatThrownBy(() -> service.requireFreshAuthentication(issuedAt, expiresAt))
                .isInstanceOf(OAuth2AuthenticationException.class);
    }
}
