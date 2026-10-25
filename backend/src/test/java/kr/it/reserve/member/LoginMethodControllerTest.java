package kr.it.reserve.member;

import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.controller.LoginMethodController;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.service.*;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class LoginMethodControllerTest {
    private final LoginMethodService methods = mock(LoginMethodService.class);
    private final RateLimiter limiter = mock(RateLimiter.class);
    private final LoginMethodController controller = new LoginMethodController(methods, limiter, mock(MemberService.class));
    @AfterEach void cleanup() { SecurityContextHolder.clearContext(); }
    @Test void aRequestForThePreviousAccountCannotModifyTheCurrentlyAuthenticatedMember() {
        Member current = Member.builder().id(8L).build();
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(current, null, List.of()));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Reserve-Member-Id", "7");
        assertThatThrownBy(() -> controller.oauth(new LoginMethodController.OAuthRequest(AuthProvider.NAVER, "Password123!", false), request))
                .isInstanceOf(MemberException.class).hasMessageContaining("로그인 상태가 변경");
        verifyNoInteractions(methods);
    }
    @Test void authenticationAndMemberScopedRateLimitsPrecedeAnyLinkAttempt() {
        assertThatThrownBy(() -> controller.oauth(new LoginMethodController.OAuthRequest(AuthProvider.NAVER, "Password123!", false),
                new MockHttpServletRequest())).isInstanceOf(MemberException.class);
        Member current = Member.builder().id(7L).build();
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(current, null, List.of()));
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Reserve-Member-Id", "7");
        when(limiter.tryConsume(anyString(), any())).thenReturn(false);
        assertThatThrownBy(() -> controller.oauth(new LoginMethodController.OAuthRequest(AuthProvider.NAVER, "Password123!", false), request))
                .isInstanceOf(MemberException.class).hasMessageContaining("시도가 너무");
        verifyNoInteractions(methods);
    }
    @Test void methodChangeResponseDoesNotOverwriteCookiesForAnotherLogin() throws Exception {
        Member current = Member.builder().id(7L).build();
        SecurityContextHolder.getContext().setAuthentication(UsernamePasswordAuthenticationToken.authenticated(current, null, List.of()));
        when(limiter.tryConsume(anyString(), any())).thenReturn(true);
        org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(controller).build()
                .perform(delete("/api/member/login-methods/password").header("X-Reserve-Member-Id", "7"))
                .andExpect(status().isOk()).andExpect(header().doesNotExist("Set-Cookie"));
        verify(methods).removePassword(current, null);
    }
}
