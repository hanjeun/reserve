package kr.it.reserve.config;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
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

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TokenProviderLifecycleTest {

    private static final String TEST_SECRET =
            "test-secret-key-for-jwt-authentication-that-is-at-least-64-characters-long-for-hmac-sha256";

    private MemberRepository memberRepository;
    private RefreshTokenRepository refreshTokenRepository;
    private TokenProvider tokenProvider;
    private Member member;
    private String token;

    @BeforeEach
    void setUp() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("test-issuer");
        properties.setSecretKey(TEST_SECRET);
        properties.getAccessToken().setExpirationMinutes(30);
        properties.getRefreshToken().setExpirationDays(7);

        memberRepository = mock(MemberRepository.class);
        refreshTokenRepository = mock(RefreshTokenRepository.class);
        tokenProvider = new TokenProvider(
                properties,
                memberRepository,
                refreshTokenRepository);
        tokenProvider.init();

        member = Member.builder()
                .id(1L)
                .name("테스트 회원")
                .email("lifecycle-token@example.com")
                .role(Role.USER)
                .build();
        when(refreshTokenRepository.findByMemberId(1L)).thenReturn(List.of());
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

    @Test
    @DisplayName("비밀번호 변경 전 access JWT는 서명이 유효해도 즉시 거부한다")
    void changedAuthenticationVersionInvalidatesExistingAccessToken() {
        member.rotateAuthVersion();
        when(memberRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));

        assertThatThrownBy(() -> tokenProvider.getActiveMemberFromToken(token))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("다시 로그인");
    }

    @Test
    @DisplayName("refresh JWT는 Bearer access 인증에 사용할 수 없다")
    void refreshTokenCannotAuthenticateAsAccessToken() {
        String refreshToken = tokenProvider.generateRefreshToken(member);

        assertThat(tokenProvider.isRefreshToken(refreshToken)).isTrue();
        assertThatThrownBy(() -> tokenProvider.getActiveMemberFromToken(refreshToken))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("접근 토큰");
    }

    @Test
    @DisplayName("access JWT는 refresh 관문을 통과할 수 없다")
    void accessTokenCannotBeUsedAsRefreshToken() {
        assertThat(tokenProvider.isRefreshToken(token)).isFalse();
    }

    @Test
    @DisplayName("purpose 없는 구버전 JWT는 Bearer access 인증에 사용할 수 없다")
    void legacyTokenWithoutPurposeCannotAuthenticateAsAccessToken() {
        String legacyToken = Jwts.builder()
                .issuer("test-issuer")
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .subject(member.getEmail())
                .claim("id", member.getId())
                .claim("role", member.getRole().name())
                .signWith(Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8)))
                .compact();

        assertThatThrownBy(() -> tokenProvider.getActiveMemberFromToken(legacyToken))
                .isInstanceOf(AuthException.class)
                .hasMessageContaining("접근 토큰");
    }
}
