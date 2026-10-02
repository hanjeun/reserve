package kr.it.reserve.config;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.oauth2.CustomOAuth2User;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationSuccessHandler;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.member.controller.MemberApiController;
import kr.it.reserve.member.dto.PasswordChangeRequest;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpHeaders;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CookieConsumerContractTest {
    @Mock MemberService memberService;
    @Mock TokenProvider tokenProvider;
    private final Member member = Member.builder().id(7L).name("시험 회원").role(Role.USER).build();

    @AfterEach void clearAuthentication() { SecurityContextHolder.clearContext(); }

    @Test void passwordChangeClearsBothSecureCookiesAfterTheServiceSucceeds() {
        authenticate();
        var request = new PasswordChangeRequest();
        request.setCurrentPassword("old-test-password-1");
        request.setNewPassword("new-test-password-2");
        request.setNewPasswordConfirm("new-test-password-2");
        var response = new MockHttpServletResponse();
        new MemberApiController(memberService, new CookieUtil("prod")).changePassword(request, response);
        verify(memberService).changePassword(7L, request);
        assertClearedCookies(response);
    }

    @Test void withdrawalClearsBothSecureCookiesAfterTheServiceSucceeds() {
        authenticate();
        var response = new MockHttpServletResponse();
        new MemberApiController(memberService, new CookieUtil("prod")).deleteMember(response);
        verify(memberService).deleteMember(7L);
        assertClearedCookies(response);
    }

    @Test void rejectedWithdrawalKeepsTheSessionCookies() {
        authenticate();
        doThrow(new IllegalStateException("active reservation")).when(memberService).deleteMember(7L);
        var response = new MockHttpServletResponse();
        var controller = new MemberApiController(memberService, new CookieUtil("prod"));
        assertThatThrownBy(() -> controller.deleteMember(response))
                .isInstanceOf(IllegalStateException.class).hasMessage("active reservation");
        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).isEmpty();
    }

    @Test void oauthSuccessIssuesSecureTokensClearsTheOldSessionAndKeepsTokensOutOfTheRedirect() throws Exception {
        var properties = new JwtProperties();
        properties.getAccessToken().setExpirationMinutes(30);
        properties.getRefreshToken().setExpirationDays(14);
        var handler = new OAuth2AuthenticationSuccessHandler(tokenProvider, properties, new CookieUtil("prod"));
        ReflectionTestUtils.setField(handler, "serverEnv", "prod");
        var principal = mock(CustomOAuth2User.class);
        when(principal.getMember()).thenReturn(member);
        when(principal.isNewUser()).thenReturn(true);
        when(tokenProvider.generateAccessToken(member)).thenReturn("test-access");
        when(tokenProvider.generateRefreshToken(member)).thenReturn("test-refresh");
        var request = new MockHttpServletRequest();
        request.getSession().setAttribute("oauth-state", "used");
        var response = new MockHttpServletResponse();
        handler.onAuthenticationSuccess(request, response,
                new UsernamePasswordAuthenticationToken(principal, null, List.of()));
        assertThat(request.getSession(false)).isNull();
        assertThat(response.getRedirectedUrl()).isEqualTo("https://reserve.it.kr/oauth2/callback?newUser=true");
        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).hasSize(3)
                .anySatisfy(cookie -> assertThat(cookie).startsWith("access_token=test-access;")
                        .contains("Max-Age=1800", "Secure", "HttpOnly", "SameSite=Lax"))
                .anySatisfy(cookie -> assertThat(cookie).startsWith("refresh_token=test-refresh;")
                        .contains("Max-Age=1209600", "Secure", "HttpOnly", "SameSite=Lax"))
                .anySatisfy(cookie -> assertThat(cookie).startsWith("JSESSIONID=;").contains("Max-Age=0", "Secure"));
    }

    private void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(member, null, List.of()));
    }

    private void assertClearedCookies(MockHttpServletResponse response) {
        assertThat(response.getHeaders(HttpHeaders.SET_COOKIE)).hasSize(2)
                .anySatisfy(cookie -> assertThat(cookie).startsWith("access_token=;")
                        .contains("Max-Age=0", "Path=/", "Secure", "HttpOnly", "SameSite=Lax"))
                .anySatisfy(cookie -> assertThat(cookie).startsWith("refresh_token=;")
                        .contains("Max-Age=0", "Path=/", "Secure", "HttpOnly", "SameSite=Lax"));
    }
}
