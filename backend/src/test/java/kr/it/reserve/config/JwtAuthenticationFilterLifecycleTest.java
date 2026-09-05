package kr.it.reserve.config;

import jakarta.servlet.FilterChain;
import kr.it.reserve.config.jwt.JwtAuthenticationFilter;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

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
}
