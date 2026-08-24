package kr.it.reserve.reservation;

import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.reservation.util.QrCheckinTokenProvider;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Date;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * QR 체크인 토큰의 <b>서명 키가 로그인 JWT 키와 분리돼 있는지</b>를 검증한다 (2026-08-24 신설).
 *
 * <p>2026-08-24 이전에는 두 토큰이 같은 키로 서명돼, <b>서로의 서명 검증을 통과했다.</b>
 * 어느 한쪽 경로에서 {@code purpose} 확인을 빠뜨리면 곧바로 교차 사용이 가능해지는 구조였고,
 * 실제로 역방향은 {@code Role.valueOf(null)} NPE 로 <b>우연히</b> 막히고 있었다.
 *
 * <p>이 테스트가 지키는 것은 그 우연을 <b>구조</b>로 바꿨다는 사실이다.
 * 키 유도 로직이나 {@code DERIVATION_INFO} 를 건드리면 여기가 먼저 빨개진다.
 * Spring 컨텍스트를 띄우지 않는다 — 이 클래스는 순수 계산이라 굳이 필요 없다.
 */
class QrCheckinTokenSecretTest {

    /** 운영과 같은 제약(64자 이상)을 만족하는 더미. 테스트 리소스의 값과 같은 모양이다. */
    private static final String JWT_SECRET =
            "test-secret-key-for-jwt-authentication-that-is-at-least-64-characters-long-for-hmac-sha256";

    private QrCheckinTokenProvider provider(String explicitQrSecret) {
        JwtProperties jwtProperties = new JwtProperties();
        jwtProperties.setSecretKey(JWT_SECRET);

        QrCheckinTokenProvider provider = new QrCheckinTokenProvider(jwtProperties);
        // @Value 주입 자리 — 컨텍스트 없이 돌리므로 직접 채운다.
        ReflectionTestUtils.setField(provider, "qrTokenSecret", explicitQrSecret);
        provider.init();
        return provider;
    }

    @Test
    @DisplayName("발급한 토큰은 같은 provider 로 다시 읽힌다")
    void 라운드트립() {
        QrCheckinTokenProvider provider = provider("");

        String token = provider.generateToken(42L, LocalDate.now());

        assertThat(provider.parseReservationId(token)).isEqualTo(42L);
    }

    @Test
    @DisplayName("★ 로그인 시크릿으로 직접 서명한 토큰은 QR 로 통하지 않는다")
    void 로그인_키로_서명한_토큰은_거부된다() {
        QrCheckinTokenProvider provider = provider("");

        // claim 구성은 진짜 QR 토큰과 완전히 동일하다. 다른 건 서명 키 하나뿐이다 —
        // 그래야 "purpose 검사가 막은 것"이 아니라 "서명이 막은 것"임이 증명된다.
        String forged = Jwts.builder()
                .expiration(new Date(System.currentTimeMillis() + 60_000))
                .claim("r", 42L)
                .claim("p", "q")
                .signWith(Keys.hmacShaKeyFor(JWT_SECRET.getBytes(StandardCharsets.UTF_8)), Jwts.SIG.HS256)
                .compact();

        assertThatThrownBy(() -> provider.parseReservationId(forged))
                .isInstanceOf(ReservationException.class);
    }

    @Test
    @DisplayName("파생 키는 로그인 시크릿 그대로가 아니다")
    void 파생키는_원본과_다르다() {
        SecretKeyPeek derived = SecretKeyPeek.of(provider(""));

        assertThat(derived.raw()).isNotEqualTo(JWT_SECRET.getBytes(StandardCharsets.UTF_8));
    }

    @Test
    @DisplayName("qr.token-secret 을 주면 그 값을 쓴다 — 파생 키로 서명한 토큰은 거부된다")
    void 명시적_시크릿이_우선한다() {
        QrCheckinTokenProvider derived = provider("");
        QrCheckinTokenProvider explicit = provider("a-dedicated-qr-secret-value-32chars-or-more!!");

        String fromDerived = derived.generateToken(7L, LocalDate.now());

        assertThat(explicit.parseReservationId(explicit.generateToken(7L, LocalDate.now()))).isEqualTo(7L);
        assertThatThrownBy(() -> explicit.parseReservationId(fromDerived))
                .isInstanceOf(ReservationException.class);
    }

    @Test
    @DisplayName("너무 짧은 qr.token-secret 은 조용히 무시되지 않고 기동을 막는다")
    void 짧은_시크릿은_예외다() {
        assertThatThrownBy(() -> provider("too-short"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("qr.token-secret");
    }

    /** provider 안의 SecretKey 를 꺼내 보기 위한 얇은 래퍼. 테스트 의도를 문장으로 남기려고 뺐다. */
    private record SecretKeyPeek(byte[] raw) {
        static SecretKeyPeek of(QrCheckinTokenProvider provider) {
            javax.crypto.SecretKey key =
                    (javax.crypto.SecretKey) ReflectionTestUtils.getField(provider, "secretKey");
            return new SecretKeyPeek(key.getEncoded());
        }
    }
}
