package kr.it.reserve.config.controller;

import jakarta.servlet.http.HttpServletRequest;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AuthApiControllerRateLimitTest {

    private static final String EMAIL = "person@example.com";
    private final MemberService memberService = mock(MemberService.class);
    private final TokenProvider tokenProvider = mock(TokenProvider.class);
    private final PasswordEncoder passwordEncoder = mock(PasswordEncoder.class);
    private AuthApiController controller;
    private int requestNumber;

    @BeforeEach
    void setUp() {
        Member member = Member.builder().id(7L).email(EMAIL).password("encoded").build();
        when(memberService.findByEmailOrNull(EMAIL)).thenReturn(member);
        when(passwordEncoder.matches(anyString(), eq("encoded")))
                .thenAnswer(invocation -> "correct".equals(invocation.getArgument(0)));
        when(tokenProvider.generateAccessToken(member)).thenReturn("access-token");
        when(tokenProvider.generateRefreshToken(member)).thenReturn("refresh-token");

        JwtProperties properties = new JwtProperties();
        properties.getAccessToken().setExpirationMinutes(15);
        properties.getRefreshToken().setExpirationDays(14);
        controller = new AuthApiController(memberService, tokenProvider, passwordEncoder,
                properties, mock(TokenService.class), new RateLimiter(), new CookieUtil("prod"));
    }

    @Test
    void exhaustedAccountQuotaStopsPasswordChecksEvenWithAnotherIpAndCorrectPassword() {
        int capacity = RateLimiter.Policy.LOGIN_ACCOUNT.capacity();
        for (int attempt = 0; attempt < capacity; attempt++) {
            assertLoginRejected("wrong", HttpStatus.UNAUTHORIZED);
        }

        assertLoginRejected("correct", HttpStatus.TOO_MANY_REQUESTS);
        verify(memberService, times(capacity)).findByEmailOrNull(EMAIL);
        verify(passwordEncoder, times(capacity)).matches("wrong", "encoded");
        verify(passwordEncoder, never()).matches("correct", "encoded");
        verify(tokenProvider, never()).generateAccessToken(org.mockito.ArgumentMatchers.any());
    }

    @Test
    void successfulLoginsDoNotAccumulateAccountQuota() {
        int attempts = RateLimiter.Policy.LOGIN_ACCOUNT.capacity() + 2;
        for (int attempt = 0; attempt < attempts; attempt++) {
            assertThat(controller.login(credentials("correct"), nextRequest(),
                    new MockHttpServletResponse()).getData().getEmail()).isEqualTo(EMAIL);
        }

        verify(passwordEncoder, times(attempts)).matches("correct", "encoded");
    }

    @Test
    void successfulLoginRefundsOnlyItsOwnReservationAndPreservesEarlierFailures() {
        int capacity = RateLimiter.Policy.LOGIN_ACCOUNT.capacity();
        assertLoginRejected("wrong", HttpStatus.UNAUTHORIZED);
        assertLoginRejected("wrong", HttpStatus.UNAUTHORIZED);

        controller.login(credentials("correct"), nextRequest(), new MockHttpServletResponse());

        for (int attempt = 2; attempt < capacity; attempt++) {
            assertLoginRejected("wrong", HttpStatus.UNAUTHORIZED);
        }
        assertLoginRejected("correct", HttpStatus.TOO_MANY_REQUESTS);
        verify(passwordEncoder, times(capacity)).matches("wrong", "encoded");
        verify(passwordEncoder, times(1)).matches("correct", "encoded");
    }

    @Test
    void explicitNullPasswordReturnsTheSameLoginFailureWithTheRealEncoder() {
        PasswordEncoder encoder = new BCryptPasswordEncoder();
        Member member = Member.builder().id(7L).email(EMAIL)
                .password(encoder.encode("correct-password")).build();
        when(memberService.findByEmailOrNull(EMAIL)).thenReturn(member);
        controller = new AuthApiController(memberService, tokenProvider, encoder,
                new JwtProperties(), mock(TokenService.class), new RateLimiter(), new CookieUtil("prod"));
        Map<String, String> requestBody = new HashMap<>();
        requestBody.put("email", EMAIL);
        requestBody.put("password", null);

        assertThatThrownBy(() -> controller.login(requestBody, nextRequest(),
                new MockHttpServletResponse()))
                .isInstanceOfSatisfying(AuthException.class, exception -> {
                    assertThat(exception.getStatus()).isEqualTo(HttpStatus.UNAUTHORIZED);
                    assertThat(exception.getMessage()).isEqualTo("이메일 또는 비밀번호가 올바르지 않아요.");
                });
        verify(tokenProvider, never()).generateAccessToken(org.mockito.ArgumentMatchers.any());
    }

    private void assertLoginRejected(String password, HttpStatus status) {
        HttpServletRequest request = nextRequest();
        assertThatThrownBy(() -> controller.login(credentials(password), request,
                new MockHttpServletResponse()))
                .isInstanceOfSatisfying(AuthException.class,
                        exception -> assertThat(exception.getStatus()).isEqualTo(status));
    }

    private Map<String, String> credentials(String password) {
        return Map.of("email", " Person@Example.com ", "password", password);
    }

    private MockHttpServletRequest nextRequest() {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setRemoteAddr("203.0.113." + ++requestNumber);
        return request;
    }
}
