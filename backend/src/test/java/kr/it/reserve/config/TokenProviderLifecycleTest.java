package kr.it.reserve.config;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TokenProviderLifecycleTest {

    private MemberRepository memberRepository;
    private TokenProvider tokenProvider;
    private Member member;
    private String token;

    @BeforeEach
    void setUp() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("test-issuer");
        properties.setSecretKey(
                "test-secret-key-for-jwt-authentication-that-is-at-least-64-characters-long-for-hmac-sha256");
        properties.getAccessToken().setExpirationMinutes(30);
        properties.getRefreshToken().setExpirationDays(7);

        memberRepository = mock(MemberRepository.class);
        tokenProvider = new TokenProvider(
                properties,
                memberRepository,
                mock(RefreshTokenRepository.class));
        tokenProvider.init();

        member = Member.builder()
                .id(1L)
                .name("테스트 회원")
                .email("lifecycle-token@example.com")
                .role(Role.USER)
                .build();
        token = tokenProvider.generateAccessToken(member);
    }

    @Test
    @DisplayName("기존 JWT도 현재 정지된 회원이면 인증하지 않는다")
    void suspendedMemberCannotReuseExistingToken() {
        member.suspend(LocalDateTime.now().plusDays(1), "운영 제재");
        when(memberRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));

        assertThatThrownBy(() -> tokenProvider.getActiveMemberFromToken(token))
                .isInstanceOf(AuthException.class);
    }

    @Test
    @DisplayName("기존 JWT도 영구정지된 회원이면 인증하지 않는다")
    void bannedMemberCannotReuseExistingToken() {
        member.ban("운영 제재");
        when(memberRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));

        assertThatThrownBy(() -> tokenProvider.getActiveMemberFromToken(token))
                .isInstanceOf(AuthException.class);
    }

    @Test
    @DisplayName("정지 기간이 끝난 회원은 기존 JWT의 남은 유효기간 동안 다시 인증할 수 있다")
    void expiredSuspensionCanAuthenticate() {
        member.suspend(LocalDateTime.now().minusMinutes(1), "기간 만료");
        when(memberRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));

        assertThat(tokenProvider.getActiveMemberFromToken(token)).isSameAs(member);
    }
}
