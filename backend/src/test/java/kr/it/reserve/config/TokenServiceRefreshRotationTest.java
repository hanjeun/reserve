package kr.it.reserve.config;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.service.RefreshRejectedException;
import kr.it.reserve.config.service.RefreshRejectedException.Reason;
import kr.it.reserve.config.service.TokenService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.within;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TokenServiceRefreshRotationTest {

    private static final String TEST_SECRET =
            "test-secret-key-for-jwt-authentication-that-is-at-least-64-characters-long-for-hmac-sha256";
    private static final long ROW_ID = 10L;

    private RefreshTokenRepository refreshTokenRepository;
    private MemberRepository memberRepository;
    private TokenProvider tokenProvider;
    private TokenService tokenService;
    private Member member;

    @BeforeEach
    void setUp() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("test-issuer");
        properties.setSecretKey(TEST_SECRET);
        properties.getAccessToken().setExpirationMinutes(30);
        properties.getRefreshToken().setExpirationDays(14);

        refreshTokenRepository = mock(RefreshTokenRepository.class);
        memberRepository = mock(MemberRepository.class);
        tokenProvider = new TokenProvider(properties, memberRepository, refreshTokenRepository);
        tokenProvider.init();
        tokenService = new TokenService(tokenProvider, refreshTokenRepository, memberRepository, properties);

        member = Member.builder()
                .id(1L)
                .name("회전 테스트")
                .email("rotation@example.com")
                .role(Role.USER)
                .build();
        when(memberRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.of(member));
        when(refreshTokenRepository.findIdsByRefreshToken(anyString())).thenReturn(List.of());
        when(refreshTokenRepository.findIdsByPreviousTokenHash(anyString())).thenReturn(List.of());
    }

    private RefreshToken storedAsCurrent(String token, LocalDateTime expiresAt) {
        RefreshToken row = new RefreshToken(1L, token, expiresAt);
        when(refreshTokenRepository.findIdsByRefreshToken(token)).thenReturn(List.of(ROW_ID));
        when(refreshTokenRepository.findByIdForUpdate(ROW_ID)).thenReturn(Optional.of(row));
        return row;
    }

    private RefreshToken rotatedFrom(String previous, String current, LocalDateTime rotatedAt) {
        RefreshToken row = new RefreshToken(1L, previous, rotatedAt.plusDays(1));
        row.rotate(current, LocalDateTime.now().plusDays(14), rotatedAt);
        when(refreshTokenRepository.findIdsByRefreshToken(current)).thenReturn(List.of(ROW_ID));
        when(refreshTokenRepository.findIdsByPreviousTokenHash(RefreshToken.hash(previous))).thenReturn(List.of(ROW_ID));
        when(refreshTokenRepository.findByIdForUpdate(ROW_ID)).thenReturn(Optional.of(row));
        return row;
    }

    private void assertRejected(String token, Reason reason) {
        assertThatThrownBy(() -> tokenService.refresh(token))
                .isInstanceOf(RefreshRejectedException.class)
                .extracting(e -> ((RefreshRejectedException) e).getReason())
                .isEqualTo(reason);
    }

    @Test
    @DisplayName("refresh는 같은 행의 토큰을 새 토큰으로 바꾸고 만료를 지금부터 14일로 다시 잡는다")
    void refreshRotatesTokenAndSlidesExpiry() {
        String presented = tokenProvider.createRefreshJwt(member);
        RefreshToken row = storedAsCurrent(presented, LocalDateTime.now().plusDays(1));

        TokenService.RefreshResult result = tokenService.refresh(presented);

        assertThat(result.refreshToken()).isNotEqualTo(presented);
        assertThat(tokenProvider.isRefreshToken(result.refreshToken())).isTrue();
        assertThat(tokenProvider.isRefreshToken(result.accessToken())).isFalse();
        assertThat(result.refreshMaxAge()).isEqualTo(Duration.ofDays(14));
        assertThat(row.getRefreshToken()).isEqualTo(result.refreshToken());
        assertThat(row.getExpiresAt()).isCloseTo(LocalDateTime.now().plusDays(14), within(Duration.ofMinutes(1)));
        assertThat(row.getPreviousTokenHash()).isEqualTo(RefreshToken.hash(presented));
        assertThat(row.getRotatedAt()).isNotNull();
        verify(refreshTokenRepository, never()).save(any());
        verify(refreshTokenRepository, never()).delete(any());
    }

    @Test
    @DisplayName("같은 초에 같은 회원에게 발급해도 refresh 토큰 문자열이 겹치지 않는다")
    void refreshTokensAreUniqueWithinTheSameSecond() {
        assertThat(tokenProvider.createRefreshJwt(member)).isNotEqualTo(tokenProvider.createRefreshJwt(member));
    }

    @Test
    @DisplayName("동시 요청이 유예 안에 직전 토큰을 들고 오면 다시 회전하지 않고 현재 토큰을 돌려준다")
    void previousTokenWithinGraceReceivesTheCurrentToken() {
        String previous = tokenProvider.createRefreshJwt(member);
        String current = tokenProvider.createRefreshJwt(member);
        RefreshToken row = rotatedFrom(previous, current, LocalDateTime.now().minusSeconds(5));

        TokenService.RefreshResult result = tokenService.refresh(previous);

        assertThat(result.refreshToken()).isEqualTo(current);
        assertThat(row.getRefreshToken()).isEqualTo(current);
        assertThat(row.getPreviousTokenHash()).isEqualTo(RefreshToken.hash(previous));
        assertThat(result.refreshMaxAge()).isPositive().isLessThanOrEqualTo(Duration.ofDays(14));
        verify(refreshTokenRepository, never()).delete(any());
    }

    @Test
    @DisplayName("유예가 지난 직전 토큰은 재사용으로 보고 그 기기 세션을 지운다")
    void previousTokenAfterGraceRevokesTheDevice() {
        String previous = tokenProvider.createRefreshJwt(member);
        String current = tokenProvider.createRefreshJwt(member);
        RefreshToken row = rotatedFrom(previous, current, LocalDateTime.now().minusMinutes(2));

        assertRejected(previous, Reason.REUSED_TOKEN);
        verify(refreshTokenRepository).delete(row);
    }

    @Test
    @DisplayName("잠금을 기다리는 사이 다른 요청이 먼저 회전했으면 잠근 뒤 값으로 판단해 유예 경로를 탄다")
    void rowRotatedWhileWaitingForTheLockUsesTheLockedValue() {
        String previous = tokenProvider.createRefreshJwt(member);
        String current = tokenProvider.createRefreshJwt(member);
        RefreshToken row = new RefreshToken(1L, previous, LocalDateTime.now().plusDays(1));
        when(refreshTokenRepository.findIdsByRefreshToken(previous)).thenReturn(List.of(ROW_ID));
        when(refreshTokenRepository.findByIdForUpdate(ROW_ID)).thenAnswer(invocation -> {
            // 잠금 대기 중 다른 트랜잭션이 커밋한 결과
            row.rotate(current, LocalDateTime.now().plusDays(14), LocalDateTime.now());
            return Optional.of(row);
        });

        TokenService.RefreshResult result = tokenService.refresh(previous);

        assertThat(result.refreshToken()).isEqualTo(current);
        assertThat(row.getRefreshToken()).isEqualTo(current);
    }

    @Test
    @DisplayName("DB에 없는 토큰(로그아웃·비밀번호 변경·기기 정리)은 거절한다")
    void unknownTokenIsRejected() {
        assertRejected(tokenProvider.createRefreshJwt(member), Reason.UNKNOWN_TOKEN);
    }

    @Test
    @DisplayName("DB 행이 만료됐으면 행을 지우고 거절한다")
    void expiredSessionRowIsDeletedAndRejected() {
        String presented = tokenProvider.createRefreshJwt(member);
        RefreshToken row = storedAsCurrent(presented, LocalDateTime.now().minusMinutes(1));

        assertRejected(presented, Reason.EXPIRED_SESSION);
        verify(refreshTokenRepository).delete(row);
    }

    @Test
    @DisplayName("비밀번호가 바뀐 뒤의 옛 refresh는 거절하고 행을 지운다")
    void authVersionChangeRejectsOldRefresh() {
        String presented = tokenProvider.createRefreshJwt(member);
        RefreshToken row = storedAsCurrent(presented, LocalDateTime.now().plusDays(1));
        member.rotateAuthVersion();

        assertRejected(presented, Reason.AUTH_VERSION_CHANGED);
        verify(refreshTokenRepository).delete(row);
    }

    @Test
    @DisplayName("탈퇴 등으로 활성 회원이 아니면 행을 지우고 거절한다")
    void unavailableMemberIsRejected() {
        String presented = tokenProvider.createRefreshJwt(member);
        RefreshToken row = storedAsCurrent(presented, LocalDateTime.now().plusDays(1));
        when(memberRepository.findByIdAndDeletedAtIsNull(1L)).thenReturn(Optional.empty());

        assertRejected(presented, Reason.MEMBER_UNAVAILABLE);
        verify(refreshTokenRepository).delete(row);
    }

    @Test
    @DisplayName("JWT 자체가 만료·위조·용도 위반이면 DB를 보지 않고 사유를 나눠 거절한다")
    void jwtLevelRejectionsAreDistinguished() {
        String expired = Jwts.builder()
                .issuer("test-issuer")
                .issuedAt(new Date(System.currentTimeMillis() - 120_000))
                .expiration(new Date(System.currentTimeMillis() - 60_000))
                .subject(member.getEmail())
                .claim("id", 1L)
                .claim("purpose", "REFRESH")
                .signWith(Keys.hmacShaKeyFor(TEST_SECRET.getBytes(StandardCharsets.UTF_8)))
                .compact();
        String valid = tokenProvider.createRefreshJwt(member);
        String tampered = valid.substring(0, valid.length() - 2) + (valid.endsWith("AA") ? "BB" : "AA");

        assertRejected(expired, Reason.EXPIRED_JWT);
        assertRejected(tampered, Reason.INVALID_JWT);
        assertRejected("not-a-jwt", Reason.INVALID_JWT);
        assertRejected(tokenProvider.generateAccessToken(member), Reason.NOT_REFRESH_TOKEN);
        verify(refreshTokenRepository, never()).findByIdForUpdate(any());
    }

    @Test
    @DisplayName("정지 기간이 끝난 회원은 refresh 때 자동 해제된다")
    void expiredSuspensionIsLiftedOnRefresh() {
        member.suspend(LocalDateTime.now().minusMinutes(1), "기간 만료");
        String presented = tokenProvider.createRefreshJwt(member);
        storedAsCurrent(presented, LocalDateTime.now().plusDays(1));

        tokenService.refresh(presented);

        assertThat(member.isSuspended()).isFalse();
        verify(memberRepository).save(member);
    }

    @Test
    @DisplayName("로그아웃은 현재 토큰이든 직전 토큰이든 그 기기 행을 지운다")
    void revokeAcceptsCurrentOrPreviousToken() {
        String previous = tokenProvider.createRefreshJwt(member);
        String current = tokenProvider.createRefreshJwt(member);
        rotatedFrom(previous, current, LocalDateTime.now().minusMinutes(10));

        tokenService.revoke(previous);
        tokenService.revoke(current);

        verify(refreshTokenRepository, org.mockito.Mockito.times(2)).deleteAllById(List.of(ROW_ID));
    }

    @Test
    @DisplayName("거절 전에 지운 행이 롤백되지 않도록 refresh 트랜잭션은 거절 예외에 롤백하지 않는다")
    void rejectionDoesNotRollBackRevocation() throws NoSuchMethodException {
        Transactional transactional = TokenService.class.getMethod("refresh", String.class)
                .getAnnotation(Transactional.class);

        assertThat(transactional).isNotNull();
        assertThat(Arrays.asList(transactional.noRollbackFor())).contains(RefreshRejectedException.class);
    }
}
