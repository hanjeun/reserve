package kr.it.reserve.reservation.util;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.global.error.ReservationException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;

/**
 * 예약 QR 체크인용 토큰 발급/검증.
 *
 * 로그인용 TokenProvider와 완전히 분리된 별도 컴포넌트 — 로그인 인증 로직에는
 * 전혀 손대지 않고 QR 기능만 독립적으로 다룰 수 있게 하기 위함. 서명 키는
 * 기존 JWT 시크릿(jwt.secret-key)을 재사용하되(새 비밀값 관리 부담 없음),
 * "purpose" 클레임으로 로그인 토큰과 혼동/재사용되지 않도록 구분한다.
 *
 * 만료 정책(2026-07 변경): 예전엔 "언제든 스캔 가능"이라며 만료를 아예 두지 않았는데,
 * 토큰이 유출되면 방문일이 한참 지난 뒤에도 그 예약을 CONFIRMED 처리할 수 있는 약점이 있었다.
 * 이제 예약 방문일 다음 날 새벽(자정+GRACE)까지만 유효하도록 만료를 넣는다 — 방문일 당일 스캔은
 * 자정 넘어까지도 넉넉히 커버하면서, 지난 예약의 토큰은 자연 무효화된다.
 * (재사용 방지는 여전히 예약 상태 전이(PENDING → CONFIRMED)가 1차로 막아준다.)
 */
@Slf4j
@RequiredArgsConstructor
@Component
public class QrCheckinTokenProvider {

    private static final String PURPOSE = "qr-checkin";
    private static final String CLAIM_RESERVATION_ID = "reservationId";
    private static final String CLAIM_PURPOSE = "purpose";

    // 방문일 다음 날 자정 이후로도 이만큼은 더 유효(심야 영업/자정 직전 방문 대비)
    private static final int GRACE_HOURS_AFTER_MIDNIGHT = 6;

    private final JwtProperties jwtProperties;
    private SecretKey secretKey;

    @PostConstruct
    public void init() {
        this.secretKey = Keys.hmacShaKeyFor(jwtProperties.getSecretKey().getBytes(StandardCharsets.UTF_8));
    }

    /**
     * 예약 ID를 인코딩한 QR 체크인 토큰 생성.
     * @param reservationId 예약 ID
     * @param reservationDate 예약 방문 날짜 — 만료 시각 계산 기준(방문일 다음 날 새벽까지 유효).
     *                        null이면 안전하게 오늘 기준으로 계산한다.
     */
    public String generateToken(Long reservationId, LocalDate reservationDate) {
        LocalDate baseDate = reservationDate != null ? reservationDate : LocalDate.now();
        // 방문일 다음 날 00:00 + GRACE 시간까지 유효
        LocalDateTime expiryDateTime = baseDate.plusDays(1).atStartOfDay().plusHours(GRACE_HOURS_AFTER_MIDNIGHT);
        Date expiry = Date.from(expiryDateTime.atZone(ZoneId.systemDefault()).toInstant());

        return Jwts.builder()
                .setIssuedAt(new Date())
                .setExpiration(expiry)
                .claim(CLAIM_RESERVATION_ID, reservationId)
                .claim(CLAIM_PURPOSE, PURPOSE)
                .signWith(secretKey)
                .compact();
    }

    /**
     * 토큰에서 예약 ID 추출 (서명·만료·purpose 검증 포함).
     * 위조됐거나, 만료됐거나, 다른 용도(로그인 토큰 등)로 발급된 토큰이면 예외 발생.
     */
    public Long parseReservationId(String token) {
        Claims claims;
        try {
            claims = Jwts.parserBuilder()
                    .setSigningKey(secretKey)
                    .build()
                    .parseClaimsJws(token)
                    .getBody();
        } catch (io.jsonwebtoken.ExpiredJwtException e) {
            log.debug("Expired QR check-in token: {}", e.getMessage());
            throw new ReservationException("만료된 QR 코드입니다. 예약 상세에서 QR을 다시 열어주세요.");
        } catch (Exception e) {
            log.debug("Invalid QR check-in token: {}", e.getMessage());
            throw new ReservationException("유효하지 않은 QR 코드입니다.");
        }
        if (!PURPOSE.equals(claims.get(CLAIM_PURPOSE, String.class))) {
            throw new ReservationException("유효하지 않은 QR 코드입니다.");
        }
        return claims.get(CLAIM_RESERVATION_ID, Long.class);
    }
}
