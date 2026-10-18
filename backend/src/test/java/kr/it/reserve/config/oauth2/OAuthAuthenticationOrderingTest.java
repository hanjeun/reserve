package kr.it.reserve.config.oauth2;

import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityRepository;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.time.Clock;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 공급자 응답 뒤 DB 행 잠금을 얻는 로그인과 보안 사건의 양방향 순서 경계. */
class OAuthAuthenticationOrderingTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 16, 1, 0);
    private MemberRepository members;
    private CustomOAuth2UserService service;
    private OAuth2UserInfo userInfo;
    private Member member;

    @BeforeEach
    void setUp() {
        members = mock(MemberRepository.class);
        OAuthSubjectSecurity subject = org.springframework.beans.BeanUtils.instantiateClass(OAuthSubjectSecurity.class);
        ReflectionTestUtils.setField(subject, "provider", "GOOGLE");
        OAuthSubjectSecurityRepository states = mock(OAuthSubjectSecurityRepository.class);
        when(states.findByKeyForUpdate(any())).thenReturn(Optional.of(subject));
        service = new CustomOAuth2UserService(members, new OAuthSubjectSecurityService(states,
                Clock.fixed(NOW.toInstant(ZoneOffset.UTC), ZoneOffset.UTC)));
        userInfo = mock(OAuth2UserInfo.class);
        when(userInfo.getProviderId()).thenReturn("subject");
        member = Member.builder().id(7L).name("retained").email("member@example.test")
                .provider(AuthProvider.GOOGLE).providerId("subject").authVersion(8)
                .oauthAuthenticatedAt(NOW.minusMinutes(2)).oauthSecurityRevokedAt(NOW).build();
        when(members.findActiveIdsByProviderAndProviderIdForUpdate("GOOGLE", "subject")).thenReturn(List.of(7L));
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        when(members.save(member)).thenReturn(member);
    }

    @Test
    void anInflightLoginIssuedBeforeOrInTheSameSecondAsTheRevocationCannotRestoreTheConnection() {
        for (LocalDateTime issuedAt : List.of(NOW.minusSeconds(30), NOW)) {
            assertThatThrownBy(() -> authenticate(issuedAt)).isInstanceOf(OAuth2AuthenticationException.class);
        }
        assertThat(member.getOauthAccessToken()).isNull();
        assertThat(member.getAuthVersion()).isEqualTo(8);
        verify(members, never()).save(any());
    }

    @Test
    void aFreshProviderAuthenticationAfterTheCutoffCanReconnectWithoutUndoingSessionRevocation() {
        authenticate(NOW.plusSeconds(1));

        assertThat(member.getOauthAccessToken()).isEqualTo("fresh-token");
        assertThat(member.getOauthAuthenticatedAt()).isEqualTo(NOW.plusSeconds(1));
        assertThat(member.getOauthSecurityRevokedAt()).isEqualTo(NOW);
        assertThat(member.getAuthVersion()).isEqualTo(8);
    }

    @Test
    void anOlderAuthenticationCannotOverwriteAMoreRecentSuccessfulLogin() {
        member.setOauthSecurityRevokedAt(null);
        member.setOauthAuthenticatedAt(NOW);
        assertThatThrownBy(() -> authenticate(NOW.minusSeconds(1))).isInstanceOf(OAuth2AuthenticationException.class);
        verify(members, never()).save(any());
    }

    @Test
    void duplicateProviderIdentityAndIdentityChangesWhileWaitingAreRejected() {
        when(members.findActiveIdsByProviderAndProviderIdForUpdate("GOOGLE", "subject")).thenReturn(List.of(7L, 8L));
        assertThatThrownBy(() -> authenticate(NOW.plusSeconds(1))).isInstanceOf(OAuth2AuthenticationException.class);
        when(members.findActiveIdsByProviderAndProviderIdForUpdate("GOOGLE", "subject")).thenReturn(List.of(7L));
        member.setProvider(AuthProvider.KAKAO);
        assertThatThrownBy(() -> authenticate(NOW.plusSeconds(1))).isInstanceOf(OAuth2AuthenticationException.class);
        verify(members, never()).save(any());
    }

    private void authenticate(LocalDateTime issuedAt) {
        ReflectionTestUtils.invokeMethod(service, "processOAuth2User", AuthProvider.GOOGLE, userInfo, "fresh-token", issuedAt,
                NOW.plusHours(1).toInstant(ZoneOffset.UTC));
    }
}
