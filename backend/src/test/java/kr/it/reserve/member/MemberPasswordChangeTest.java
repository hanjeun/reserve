package kr.it.reserve.member;

import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.dto.PasswordChangeRequest;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MemberPasswordChangeTest {

    private static final long MEMBER_ID = 9L;
    private static final String CURRENT = "Current123!";
    private static final String NEXT = "NextReserve456!";

    @Mock private MemberRepository memberRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private PasswordResetTokenRepository passwordResetTokenRepository;
    @Mock private RateLimiter rateLimiter;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private PwnedPasswordChecker pwnedPasswordChecker;
    @Mock private kr.it.reserve.member.mfa.MfaService mfa;
    @InjectMocks private MemberService memberService;

    private Member member;

    @BeforeEach
    void setUp() {
        org.springframework.test.util.ReflectionTestUtils.setField(memberService, "mfa", mfa);
        member = Member.builder()
                .id(MEMBER_ID)
                .email("password@example.com")
                .password("current-hash")
                .provider(AuthProvider.LOCAL)
                .build();
        when(memberRepository.findActiveByIdForUpdate(MEMBER_ID)).thenReturn(Optional.of(member));
        org.mockito.Mockito.lenient().when(rateLimiter.tryConsume("login-method:member:" + MEMBER_ID, RateLimiter.Policy.LOGIN_METHOD_CHANGE)).thenReturn(true);
    }

    @Test
    void rejectsAChangeWithoutCurrentPasswordReauthentication() {
        PasswordChangeRequest request = request("wrong", NEXT, NEXT);
        when(passwordEncoder.matches("wrong", "current-hash")).thenReturn(false);

        assertThatThrownBy(() -> memberService.changePassword(MEMBER_ID, request))
                .isInstanceOf(MemberException.class)
                .hasMessageContaining("현재 비밀번호");

        verify(passwordEncoder, never()).encode(NEXT);
        verify(refreshTokenRepository, never()).deleteByMemberId(MEMBER_ID);
        assertThat(member.getPassword()).isEqualTo("current-hash");
    }

    @Test
    void changesThePasswordAndInvalidatesEveryRefreshSession() {
        PasswordChangeRequest request = request(CURRENT, NEXT, NEXT);
        when(passwordEncoder.matches(CURRENT, "current-hash")).thenReturn(true);
        when(passwordEncoder.matches(NEXT, "current-hash")).thenReturn(false);
        when(pwnedPasswordChecker.isPwned(NEXT)).thenReturn(false);
        when(passwordEncoder.encode(NEXT)).thenReturn("next-hash");

        memberService.changePassword(MEMBER_ID, request);

        assertThat(member.getPassword()).isEqualTo("next-hash");
        assertThat(member.getAuthVersion()).isEqualTo(1);
        verify(mfa).consumeSensitive(member, kr.it.reserve.member.mfa.MfaService.SensitiveAction.CHANGE);
        verify(refreshTokenRepository).deleteByMemberId(MEMBER_ID);
        verify(passwordResetTokenRepository).invalidateForEmail(member.getEmail());
    }

    @Test
    void bothPasswordChangeEntryPointsStopBeforeHashComparisonWhenTheMemberQuotaIsExhausted() {
        when(rateLimiter.tryConsume("login-method:member:" + MEMBER_ID, RateLimiter.Policy.LOGIN_METHOD_CHANGE)).thenReturn(false);
        assertThatThrownBy(() -> memberService.changePassword(MEMBER_ID, request(CURRENT, NEXT, NEXT)))
                .isInstanceOf(MemberException.class).hasMessageContaining("시도가 너무 많아요");
        org.mockito.Mockito.verifyNoInteractions(passwordEncoder, pwnedPasswordChecker, refreshTokenRepository, passwordResetTokenRepository);
        assertThat(member.getAuthVersion()).isZero();
    }

    @Test
    void switchingBetweenLegacyAndLoginMethodApisDoesNotMultiplyPasswordGuesses() {
        org.springframework.test.util.ReflectionTestUtils.setField(memberService, "rateLimiter", new RateLimiter());
        var apiLimiter = org.mockito.Mockito.mock(RateLimiter.class);
        when(apiLimiter.tryConsume(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any())).thenReturn(true);
        var methods = new kr.it.reserve.member.controller.LoginMethodController(
                org.mockito.Mockito.mock(kr.it.reserve.member.service.LoginMethodService.class), apiLimiter, memberService);
        var legacy = new kr.it.reserve.member.controller.MemberApiController(memberService,
                org.mockito.Mockito.mock(kr.it.reserve.config.util.CookieUtil.class),
                org.mockito.Mockito.mock(kr.it.reserve.member.service.MemberWithdrawalService.class), apiLimiter);
        var http = new org.springframework.mock.web.MockHttpServletRequest();
        http.addHeader("X-Reserve-Member-Id", String.valueOf(MEMBER_ID));
        org.springframework.security.core.context.SecurityContextHolder.getContext().setAuthentication(
                org.springframework.security.authentication.UsernamePasswordAuthenticationToken.authenticated(member, null, java.util.List.of()));
        try {
            for (int i = 0; i < RateLimiter.Policy.LOGIN_METHOD_CHANGE.capacity(); i++) {
                int attempt = i;
                assertThatThrownBy(() -> {
                    if (attempt % 2 == 0) legacy.changePassword(request("wrong", NEXT, NEXT), new org.springframework.mock.web.MockHttpServletResponse());
                    else methods.changePassword(request("wrong", NEXT, NEXT), http);
                }).isInstanceOf(MemberException.class).hasMessageContaining("현재 비밀번호");
            }
            assertThatThrownBy(() -> legacy.changePassword(request("wrong", NEXT, NEXT), new org.springframework.mock.web.MockHttpServletResponse()))
                    .isInstanceOf(MemberException.class).hasMessageContaining("시도가 너무 많아요");
            verify(passwordEncoder, org.mockito.Mockito.times(RateLimiter.Policy.LOGIN_METHOD_CHANGE.capacity())).matches("wrong", "current-hash");
        } finally { org.springframework.security.core.context.SecurityContextHolder.clearContext(); }
    }

    private PasswordChangeRequest request(String current, String next, String confirmation) {
        PasswordChangeRequest request = new PasswordChangeRequest();
        request.setCurrentPassword(current);
        request.setNewPassword(next);
        request.setNewPasswordConfirm(confirmation);
        return request;
    }
}
