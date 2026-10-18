package kr.it.reserve.member;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityRepository;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.MemberService;
import kr.it.reserve.member.service.MemberWithdrawalService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class MemberWithdrawalServiceTest {
    private static final Instant NOW = Instant.parse("2026-10-16T01:00:00.123456Z");
    private static final LocalDateTime AUTHENTICATED = LocalDateTime.of(2026, 10, 16, 0, 59);
    private MemberService core;
    private MemberRepository members;
    private OAuthSubjectSecurityRepository states;
    private OAuthSubjectSecurity subject;
    private MemberWithdrawalService gate;
    private Member current;
    private Member principal;

    @BeforeEach void setUp() {
        core = mock(MemberService.class);
        members = mock(MemberRepository.class);
        states = mock(OAuthSubjectSecurityRepository.class);
        subject = BeanUtils.instantiateClass(OAuthSubjectSecurity.class);
        ReflectionTestUtils.setField(subject, "provider", "GOOGLE");
        when(states.findByKeyForUpdate(any())).thenReturn(Optional.of(subject));
        OAuthSubjectSecurityService locks = new OAuthSubjectSecurityService(states, Clock.fixed(NOW, ZoneOffset.UTC));
        TokenProvider tokens = new TokenProvider(new JwtProperties(), members, mock(RefreshTokenRepository.class));
        gate = new MemberWithdrawalService(core, members, locks, tokens);
        current = member();
        principal = member();
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(current));
    }

    @Test void oauthWithdrawalLocksSubjectBeforeCurrentMemberAndPreservesACutoffAfterIdentityRemoval() {
        doAnswer(invocation -> { current.withdraw("withdrawn-7@reserve.invalid"); return null; }).when(core).deleteMember(7L);

        gate.withdraw(principal, AUTHENTICATED);

        var order = inOrder(states, members, core);
        order.verify(states).findByKeyForUpdate(any());
        order.verify(members).findActiveByIdForUpdate(7L);
        order.verify(members).flush();
        order.verify(core).deleteMember(7L);
        assertThat(subject.getRevokedAt()).isEqualTo(LocalDateTime.of(2026, 10, 16, 1, 0, 0, 123_000_000));
        assertThat(subject.acceptsAuthentication(AUTHENTICATED)).isFalse();
        assertThat(current.getProviderId()).isNull();
        assertThat(current.getOauthSecurityRevokedAt()).isNull();
    }

    @Test void identityGenerationAndCutoffAreRecheckedAfterWaitingBeforeAnyWithdrawal() {
        current.rotateAuthVersion();
        assertThatThrownBy(() -> gate.withdraw(principal, AUTHENTICATED)).isInstanceOf(AuthException.class);
        current.setAuthVersion(principal.getAuthVersion());
        current.setProviderId("changed-identity");
        assertThatThrownBy(() -> gate.withdraw(principal, AUTHENTICATED)).isInstanceOf(AuthException.class);
        current.setProviderId(principal.getProviderId());
        current.recordOAuthSecurityRevocation(AUTHENTICATED.plusSeconds(1));
        assertThatThrownBy(() -> gate.withdraw(principal, AUTHENTICATED)).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> gate.withdraw(principal, null)).isInstanceOf(AuthException.class);
        verifyNoInteractions(core);
    }

    @Test void aLegacyOAuthSessionWithoutACutoffCanWithdrawAndLocalSessionsNeedNoSubjectRow() {
        gate.withdraw(principal, null);
        verify(core).deleteMember(7L);

        current.setProvider(AuthProvider.LOCAL);
        principal.setProvider(AuthProvider.LOCAL);
        org.mockito.Mockito.clearInvocations(core, states);
        gate.withdraw(principal, null);
        verifyNoInteractions(states);
        verify(core).deleteMember(7L);
    }

    private Member member() {
        return Member.builder().id(7L).name("synthetic").email("synthetic@example.invalid")
                .provider(AuthProvider.GOOGLE).providerId("synthetic-subject").authVersion(3)
                .oauthAuthenticatedAt(AUTHENTICATED).build();
    }
}
