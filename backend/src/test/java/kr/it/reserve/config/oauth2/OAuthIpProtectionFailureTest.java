package kr.it.reserve.config.oauth2;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import kr.it.reserve.global.security.ip.IpLoginProtection;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.mfa.MfaService;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.test.util.ReflectionTestUtils;
import java.time.*;
import java.util.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class OAuthIpProtectionFailureTest {
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void bothPendingAndFinalSessionOutagesUseTheAllowlistedEnvironmentError(boolean pending) {
        var tokens = mock(TokenProvider.class);
        var members = mock(MemberRepository.class);
        var subjects = mock(OAuthSubjectSecurityService.class);
        var mfa = mock(MfaService.class);
        LocalDateTime at = LocalDateTime.now(Clock.systemUTC());
        Instant expires = Instant.now().plusSeconds(300);
        var member = Member.builder().id(7L).role(Role.USER).provider(AuthProvider.GOOGLE).providerId("synthetic-subject")
                .oauthAuthenticatedAt(at).build();
        var subject = mock(OAuthSubjectSecurity.class);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        when(subjects.lock(AuthProvider.GOOGLE, "synthetic-subject")).thenReturn(subject);
        when(subject.acceptsAuthentication(any())).thenReturn(true);
        var issuer = new OAuthSessionIssuer(tokens, members, subjects);
        ReflectionTestUtils.setField(issuer, "mfa", mfa);
        if (pending) when(mfa.beginLogin(eq(member), any(), any(), eq(false))).thenThrow(new IpLoginProtection.Unavailable());
        else when(tokens.issueSession(eq(member), any(), eq(false))).thenThrow(new IpLoginProtection.Unavailable());
        var principal = new CustomOAuth2User(member, Map.of("sub", "synthetic-subject"), "sub", false, expires, true);

        assertThatThrownBy(() -> issuer.issue(principal, false)).isInstanceOfSatisfying(OAuth2AuthenticationException.class,
                failure -> assertThat(failure.getError().getErrorCode()).isEqualTo("ip_verification_unavailable"));
        if (pending) verifyNoInteractions(tokens);
    }
}
