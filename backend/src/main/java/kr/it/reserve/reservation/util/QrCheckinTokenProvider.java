package kr.it.reserve.reservation.util;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.global.error.ReservationException;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Date;

/**
 * 로그인 토큰과 서명 용도를 구분한 예약 QR 체크인 토큰을 발급하고 검증한다.
 * <p>QR_TOKEN_SECRET이 있으면 전용 키를 사용하고, 없으면 로그인 키와 목적 라벨로 HMAC 키를 파생한다.
 * 파생 방식은 로그인 키 유출의 영향을 함께 받으므로 독립 키 운영이 필요하면 전용 키를 설정한다.
 * 키 또는 파생 목적 라벨을 바꾸면 이미 발급된 QR은 무효가 된다.
 * <p>만료는 KST 방문일 다음 날의 유예 시각과 발급 후 24시간 중 이른 시각으로 제한한다.
 * 서명·만료 외에 QR 전용 purpose도 검증해 다른 용도의 토큰을 거부한다.
 */
@Slf4j
@RequiredArgsConstructor
@Component
public class QrCheckinTokenProvider {

    private static final String PURPOSE = "qr-checkin";
    private static final String CLAIM_RESERVATION_ID = "reservationId";
    private static final String CLAIM_PURPOSE = "purpose";

    // 짧은 클레임을 발급하되 기존 긴 이름의 클레임도 계속 읽는다.
    private static final String CLAIM_RESERVATION_ID_SHORT = "r";
    private static final String CLAIM_PURPOSE_SHORT = "p";
    private static final String PURPOSE_SHORT = "q";

    // 방문일 다음 날 자정 이후로도 이만큼은 더 유효(심야 영업/자정 직전 방문 대비)
    private static final int GRACE_HOURS_AFTER_MIDNIGHT = 6;

    // 발급 시점 기준 상한. 예약일이 멀수록 만료가 한없이 길어지던 문제를 막는다.
    private static final int MAX_LIFETIME_HOURS = 24;

    // 예약일·만료는 ServiceTime의 한국 시간으로 계산한다. JVM 기본 시간대로 바꾸지 않는다.
    private static final ZoneId SERVICE_ZONE = kr.it.reserve.global.common.ServiceTime.ZONE;

    /**
     * 파생 키의 용도 라벨. <b>바꾸면 그 순간 발급돼 있던 QR 이 전부 무효가 된다.</b>
     * 버전을 올려야 할 일이 생기면 그 사실을 알고 올릴 것 (예: v1 → v2).
     */
    private static final String DERIVATION_INFO = "reserve/qr-checkin/v1";
    private static final String HMAC_ALG = "HmacSHA256";

    /** 명시 키의 최소 문자 수. UTF-8 변환 후 키 길이는 Keys.hmacShaKeyFor에서도 검사한다. */
    private static final int MIN_EXPLICIT_SECRET_LENGTH = 32;

    private final JwtProperties jwtProperties;

    /** 전용 키가 비어 있으면 로그인 키와 목적 라벨로 QR 전용 키를 파생한다. */
    @Value("${qr.token-secret:}")
    private String qrTokenSecret;

    private SecretKey secretKey;

    @PostConstruct
    public void init() {
        if (qrTokenSecret != null && !qrTokenSecret.isBlank()) {
            String trimmed = qrTokenSecret.trim();
            if (trimmed.length() < MIN_EXPLICIT_SECRET_LENGTH) {
                // 조용히 파생으로 폴백하지 않는다 — 값을 넣었는데 안 쓰이는 게 제일 나쁘다.
                throw new IllegalStateException(
                        "qr.token-secret must contain at least " + MIN_EXPLICIT_SECRET_LENGTH + " characters. "
                                + "(actual " + trimmed.length() + ") Leave it empty to derive the key from the JWT secret.");
            }
            this.secretKey = Keys.hmacShaKeyFor(trimmed.getBytes(StandardCharsets.UTF_8));
            log.info("QR check-in signing key: dedicated secret (qr.token-secret)");
        } else {
            this.secretKey = deriveFromJwtSecret(jwtProperties.getSecretKey());
            log.info("QR check-in signing key: derived from jwt.secret-key (info={})", DERIVATION_INFO);
        }
    }

    /**
     * 로그인 시크릿에서 QR 전용 키를 유도한다. HKDF 의 expand 단계와 같은 형태로,
     * 같은 입력에는 항상 같은 32바이트가 나오고 원본 시크릿과는 완전히 다른 값이 된다.
     * → 로그인 토큰과 QR 토큰이 서로의 서명 검증을 통과할 수 없다.
     */
    private static SecretKey deriveFromJwtSecret(String jwtSecret) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALG);
            mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), HMAC_ALG));
            return Keys.hmacShaKeyFor(mac.doFinal(DERIVATION_INFO.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.GeneralSecurityException e) {
            // HmacSHA256 은 모든 JRE 가 반드시 제공한다. 여기 오면 런타임이 망가진 것이므로
            // 조용히 로그인 키로 폴백하지 않는다 — 그러면 분리가 없던 일이 된다.
            throw new IllegalStateException("QR signing key derivation failed", e);
        }
    }

    /**
     * 예약 ID를 인코딩한 QR 체크인 토큰 생성.
     * @param reservationId 예약 ID
     * @param reservationDate 예약 방문 날짜 — 만료 시각 계산 기준(방문일 다음 날 새벽까지 유효).
     *                        null이면 안전하게 오늘 기준으로 계산한다.
     */
    public String generateToken(Long reservationId, LocalDate reservationDate) {
        LocalDate baseDate = reservationDate != null ? reservationDate : LocalDate.now(SERVICE_ZONE);
        // 방문일 다음 날 00:00 + GRACE 시간까지 유효
        LocalDateTime expiryDateTime = baseDate.plusDays(1).atStartOfDay().plusHours(GRACE_HOURS_AFTER_MIDNIGHT);
        Instant expiryInstant = expiryDateTime.atZone(SERVICE_ZONE).toInstant();

        // 방문일이 멀어도 발급 시점 기준 수명 상한을 적용한다.
        Instant cap = Instant.now().plus(MAX_LIFETIME_HOURS, ChronoUnit.HOURS);
        Date expiry = Date.from(expiryInstant.isBefore(cap) ? expiryInstant : cap);

        // QR 밀도를 줄이기 위해 HS256·짧은 클레임을 사용하고 발급 시각은 생략한다.
        return Jwts.builder()
                .expiration(expiry)
                .claim(CLAIM_RESERVATION_ID_SHORT, reservationId)
                .claim(CLAIM_PURPOSE_SHORT, PURPOSE_SHORT)
                .signWith(secretKey, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * 토큰에서 예약 ID 추출 (서명·만료·purpose 검증 포함).
     * 위조됐거나, 만료됐거나, 다른 용도(로그인 토큰 등)로 발급된 토큰이면 예외 발생.
     */
    public Long parseReservationId(String token) {
        Claims claims;
        try {
            claims = Jwts.parser()
                    .verifyWith(secretKey)
                    .build()
                    .parseSignedClaims(token)
                    .getPayload();
        } catch (io.jsonwebtoken.ExpiredJwtException e) {
            log.debug("Expired QR check-in token");
            throw new ReservationException("만료된 QR 코드예요. 예약 상세에서 QR을 다시 열어주세요.");
        } catch (Exception e) {
            log.debug("Invalid QR check-in token: errorType={}", e.getClass().getSimpleName());
            throw new ReservationException("유효하지 않은 QR 코드예요.");
        }
        // 짧은 클레임(신규)과 긴 클레임(기존 발급분)을 둘 다 받는다.
        // 배포 시점에 이미 열려 있던 QR이 즉시 무효가 되지 않도록 한 과도기 처리다.
        boolean purposeOk = PURPOSE_SHORT.equals(claims.get(CLAIM_PURPOSE_SHORT, String.class))
                || PURPOSE.equals(claims.get(CLAIM_PURPOSE, String.class));
        if (!purposeOk) {
            throw new ReservationException("유효하지 않은 QR 코드예요.");
        }

        Long reservationId = claims.get(CLAIM_RESERVATION_ID_SHORT, Long.class);
        if (reservationId == null) {
            reservationId = claims.get(CLAIM_RESERVATION_ID, Long.class);
        }
        if (reservationId == null) {
            throw new ReservationException("유효하지 않은 QR 코드예요.");
        }
        return reservationId;
    }
}
