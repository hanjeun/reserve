package kr.it.reserve.config;

import jakarta.servlet.FilterChain;
import kr.it.reserve.config.jwt.JwtAuthenticationFilter;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JwtAuthenticationFilterLifecycleTest {

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    @DisplayName("서명이 맞는 JWT도 현재 활성 회원 행을 확인한 뒤에만 인증한다")
    void tokenMustResolveToActiveMember() throws Exception {
        TokenProvider tokenProvider = mock(TokenProvider.class);
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader("Authorization", "Bearer token-value");

        Member active = Member.builder().id(1L).email("active@example.com").role(Role.USER).build();
        when(tokenProvider.validToken("token-value")).thenReturn(true);
        when(tokenProvider.getActiveMemberFromToken("token-value")).thenReturn(active);

        new JwtAuthenticationFilter(tokenProvider).doFilter(request, response, chain);

        verify(tokenProvider).getActiveMemberFromToken("token-value");
        verify(chain).doFilter(request, response);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getPrincipal())
                .isSameAs(active);
    }

    @Test
    void capturesTheVerifiedOriginalAuthenticationWithoutCopyingTheLatestMemberLoginOrRawToken() throws Exception {
        TokenProvider tokens = mock(TokenProvider.class);
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader("Authorization", "Bearer opaque-access-token");
        LocalDateTime original = LocalDateTime.of(2026, 10, 16, 8, 0);
        Member current = Member.builder().id(1L).email("active@example.com").role(Role.USER)
                .oauthAuthenticatedAt(original.plusHours(1)).build();
        when(tokens.validToken("opaque-access-token")).thenReturn(true);
        when(tokens.getActiveMemberFromToken("opaque-access-token")).thenReturn(current);
        when(tokens.getOAuthAuthenticationAt("opaque-access-token")).thenReturn(original);

        new JwtAuthenticationFilter(tokens).doFilter(request, response, chain);

        assertThat(SecurityUtil.getOAuthAuthenticationAt()).isEqualTo(original);
        assertThat(SecurityContextHolder.getContext().getAuthentication().getDetails())
                .isEqualTo(new SecurityUtil.OAuthAuthenticationDetails(original));
        assertThat(SecurityContextHolder.getContext().getAuthentication().getDetails().toString())
                .doesNotContain("opaque-access-token");
        verify(chain).doFilter(request, response);
    }

    @Test
    void legacyTokensKeepAnUnknownOriginalAuthenticationAndDoNotInheritTheLatestMemberLogin() throws Exception {
        TokenProvider tokens = mock(TokenProvider.class);
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("Authorization", "Bearer legacy-access-token");
        Member current = Member.builder().id(1L).email("active@example.com").role(Role.USER)
                .oauthAuthenticatedAt(LocalDateTime.of(2026, 10, 16, 9, 0)).build();
        when(tokens.validToken("legacy-access-token")).thenReturn(true);
        when(tokens.getActiveMemberFromToken("legacy-access-token")).thenReturn(current);

        new JwtAuthenticationFilter(tokens).doFilter(request, new MockHttpServletResponse(), mock(FilterChain.class));

        assertThat(SecurityUtil.getOAuthAuthenticationAt()).isNull();
        assertThat(SecurityContextHolder.getContext().getAuthentication().getDetails())
                .isEqualTo(new SecurityUtil.OAuthAuthenticationDetails(null));
    }

    @Test
    void aFailureReadingTheVerifiedClaimDoesNotInstallAnAuthentication() throws Exception {
        TokenProvider tokens = mock(TokenProvider.class);
        FilterChain chain = mock(FilterChain.class);
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();
        request.addHeader("Authorization", "Bearer invalid-context-token");
        when(tokens.validToken("invalid-context-token")).thenReturn(true);
        when(tokens.getActiveMemberFromToken("invalid-context-token")).thenReturn(Member.builder().id(1L).role(Role.USER).build());
        when(tokens.getOAuthAuthenticationAt("invalid-context-token")).thenThrow(new io.jsonwebtoken.JwtException("invalid context"));

        new JwtAuthenticationFilter(tokens).doFilter(request, response, chain);

        assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
        verify(chain).doFilter(request, response);
    }
}
