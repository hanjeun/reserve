package com.reserve.reservation.util;

import com.reserve.config.jwt.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * 예약 QR 체크인용 토큰 발급/검증.
 *
 * 로그인용 TokenProvider와 완전히 분리된 별도 컴포넌트 — 로그인 인증 로직에는
 * 전혀 손대지 않고 QR 기능만 독립적으로 다룰 수 있게 하기 위함. 서명 키는
 * 기존 JWT 시크릿(jwt.secret-key)을 재사용하되(새 비밀값 관리 부담 없음),
 * "purpose" 클레임으로 로그인 토큰과 혼동/재사용되지 않도록 구분한다.
 *
 * 만료 시간을 두지 않음(요청사항: "언제든 스캔 가능") — 재사용 방지는
 * 예약 상태 전이(PENDING → CONFIRMED) 자체가 자연스럽게 막아준다
 * (ReservationService.checkInByQrToken 참고).
 */
@Slf4j
@RequiredArgsConstructor
@Component
public class QrCheckinTokenProvider {

    private static final String PURPOSE = "qr-checkin";
    private static final String CLAIM_RESERVATION_ID = "reservationId";
    private static final String CLAIM_PURPOSE = "purpose";

    private final JwtProperties jwtProperties;
    private SecretKey secretKey;

    @PostConstruct
    public void init() {
        this.secretKey = Keys.hmacShaKeyFor(jwtProperties.getSecretKey().getBytes(StandardCharsets.UTF_8));
    }

    /** 예약 ID를 인코딩한 QR 체크인 토큰 생성 (만료 없음) */
    public String generateToken(Long reservationId) {
        return Jwts.builder()
                .setIssuedAt(new Date())
                .claim(CLAIM_RESERVATION_ID, reservationId)
                .claim(CLAIM_PURPOSE, PURPOSE)
                .signWith(secretKey)
                .compact();
    }

    /**
     * 토큰에서 예약 ID 추출 (서명·purpose 검증 포함).
     * 위조됐거나 다른 용도(로그인 토큰 등)로 발급된 토큰이면 예외 발생.
     */
    public Long parseReservationId(String token) {
        Claims claims;
        try {
            claims = Jwts.parserBuilder()
                    .setSigningKey(secretKey)
                    .build()
                    .parseClaimsJws(token)
                    .getBody();
        } catch (Exception e) {
            log.debug("Invalid QR check-in token: {}", e.getMessage());
            throw new IllegalArgumentException("유효하지 않은 QR 코드입니다.");
        }
        if (!PURPOSE.equals(claims.get(CLAIM_PURPOSE, String.class))) {
            throw new IllegalArgumentException("유효하지 않은 QR 코드입니다.");
        }
        return claims.get(CLAIM_RESERVATION_ID, Long.class);
    }
}
