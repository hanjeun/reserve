package kr.it.reserve.config;

import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.jwt.*;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.member.entity.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.*;
import org.springframework.security.core.context.SecurityContextHolder;
import java.time.LocalDateTime;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class JwtAuthenticationFilterLifecycleTest {
    @AfterEach void clear() { SecurityContextHolder.clearContext(); }
    @Test void authenticationUsesOneVerifiedResultAndTheCurrentDatabaseRole() throws Exception {
        TokenProvider tokens = mock(TokenProvider.class);
        var member = Member.builder().id(1L).role(Role.ADMIN).build();
        LocalDateTime original = LocalDateTime.of(2026, 10, 16, 8, 0);
        when(tokens.verifyAuthentication("access-value")).thenReturn(
                new TokenProvider.VerifiedAuthentication(member, original, "OAUTH", "device-id"));
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer access-value");
        FilterChain chain = mock(FilterChain.class);
        new JwtAuthenticationFilter(tokens).doFilter(request, new MockHttpServletResponse(), chain);
        assertThat(SecurityUtil.getCurrentMember()).isSameAs(member);
        assertThat(SecurityUtil.getOAuthAuthenticationAt()).isEqualTo(original);
        assertThat(SecurityUtil.getLoginMethod()).isEqualTo("OAUTH");
        assertThat(SecurityUtil.getSessionId()).isEqualTo("device-id");
        assertThat(SecurityContextHolder.getContext().getAuthentication().getAuthorities())
                .extracting(Object::toString).containsExactly("ROLE_ADMIN");
        assertThat(SecurityContextHolder.getContext().getAuthentication().getDetails().toString()).doesNotContain("access-value");
        verify(tokens).verifyAuthentication("access-value");
        verifyNoMoreInteractions(tokens);
        verify(chain).doFilter(org.mockito.ArgumentMatchers.eq(request), org.mockito.ArgumentMatchers.any());
    }
    @Test void passwordSessionDoesNotAcquireTheMembersLatestProviderProof() throws Exception {
        TokenProvider tokens = mock(TokenProvider.class);
        var member = Member.builder().id(1L).role(Role.USER).oauthAuthenticatedAt(LocalDateTime.now()).build();
        when(tokens.verifyAuthentication("password-value")).thenReturn(
                new TokenProvider.VerifiedAuthentication(member, null, "PASSWORD", "password-device"));
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("access_token", "password-value"));
        new JwtAuthenticationFilter(tokens).doFilter(request, new MockHttpServletResponse(), mock(FilterChain.class));
        assertThat(SecurityUtil.getOAuthAuthenticationAt()).isNull();
        assertThat(SecurityUtil.getLoginMethod()).isEqualTo("PASSWORD");
    }
    @Test void failedVerificationDoesNotInstallAuthenticationAndStillContinuesTheChain() throws Exception {
        TokenProvider tokens = mock(TokenProvider.class);
        when(tokens.verifyAuthentication("invalid-value")).thenThrow(new JwtException("invalid verified context"));
        var request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer invalid-value");
        FilterChain chain = mock(FilterChain.class);
        var response = new MockHttpServletResponse();
        new JwtAuthenticationFilter(tokens).doFilter(request, response, chain);
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(chain).doFilter(request, response);
    }
    @Test void distinctSameNameCookieCredentialsAreNotChosenByHeaderOrder() throws Exception {
        TokenProvider tokens = mock(TokenProvider.class);
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("access_token", "first"), new Cookie("access_token", "second"));
        new JwtAuthenticationFilter(tokens).doFilter(request, new MockHttpServletResponse(), mock(FilterChain.class));
        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verifyNoInteractions(tokens);
    }
}
