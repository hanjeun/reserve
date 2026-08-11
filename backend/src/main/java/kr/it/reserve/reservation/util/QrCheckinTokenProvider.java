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
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
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

    // ★ 짧은 클레임 이름 (2026-08-09) — 아래 "QR 크기" 주석 참고.
    //   기존 이름으로 발급된 토큰도 계속 읽어야 하므로 파싱은 둘 다 받는다.
    private static final String CLAIM_RESERVATION_ID_SHORT = "r";
    private static final String CLAIM_PURPOSE_SHORT = "p";
    private static final String PURPOSE_SHORT = "q";

    // 방문일 다음 날 자정 이후로도 이만큼은 더 유효(심야 영업/자정 직전 방문 대비)
    private static final int GRACE_HOURS_AFTER_MIDNIGHT = 6;

    // 발급 시점 기준 상한. 예약일이 멀수록 만료가 한없이 길어지던 문제를 막는다.
    private static final int MAX_LIFETIME_HOURS = 24;

    // 예약 시각·만료 계산은 서비스 운영 시간대(KST) 기준이어야 한다.
    // 앱 컨테이너에는 TZ가 설정돼 있지 않아 systemDefault()는 UTC로 잡힌다 —
    // 그대로 두면 "방문일 다음 날 새벽 6시"가 실제로는 다음 날 15시(KST)가 된다.
    private static final ZoneId SERVICE_ZONE = ZoneId.of("Asia/Seoul");

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
        LocalDate baseDate = reservationDate != null ? reservationDate : LocalDate.now(SERVICE_ZONE);
        // 방문일 다음 날 00:00 + GRACE 시간까지 유효
        LocalDateTime expiryDateTime = baseDate.plusDays(1).atStartOfDay().plusHours(GRACE_HOURS_AFTER_MIDNIGHT);
        Instant expiryInstant = expiryDateTime.atZone(SERVICE_ZONE).toInstant();

        // ★ 발급 시점 기준 상한을 씌운다 (2026-08-09).
        //   예전엔 만료가 예약일에만 걸려 있어서, 90일 뒤 예약이면 91일짜리 토큰이 나왔다.
        //   QR 모달은 열 때마다 서버에서 새 토큰을 받으므로 짧게 잡아도 사용성에 영향이 없다.
        Instant cap = Instant.now().plus(MAX_LIFETIME_HOURS, ChronoUnit.HOURS);
        Date expiry = Date.from(expiryInstant.isBefore(cap) ? expiryInstant : cap);

        // ★ 페이로드를 줄인다 (2026-08-09) — QR이 아예 안 읽히던 문제의 절반이 여기였다.
        //   jwt.secret-key가 64자 이상이면 jjwt가 서명 알고리즘을 HS512로 자동 선택하고,
        //   서명만 86자가 붙는다. 여기에 iat와 긴 클레임 이름까지 더해 토큰이 215자가 됐고
        //   QR은 버전 11(61x61 모듈)이 됐다. 스캐너 쪽 해상도로는 못 읽는 밀도다.
        //   HS256 고정 + iat 제거 + 짧은 클레임 이름으로 113자(버전 7, 45x45)까지 줄인다.
        //   HS256도 이 용도(짧은 수명·서버 단독 검증)에는 충분하다.
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
            log.debug("Expired QR check-in token: {}", e.getMessage());
            throw new ReservationException("만료된 QR 코드입니다. 예약 상세에서 QR을 다시 열어주세요.");
        } catch (Exception e) {
            log.debug("Invalid QR check-in token: {}", e.getMessage());
            throw new ReservationException("유효하지 않은 QR 코드입니다.");
        }
        // 짧은 클레임(신규)과 긴 클레임(기존 발급분)을 둘 다 받는다.
        // 배포 시점에 이미 열려 있던 QR이 즉시 무효가 되지 않도록 한 과도기 처리다.
        boolean purposeOk = PURPOSE_SHORT.equals(claims.get(CLAIM_PURPOSE_SHORT, String.class))
                || PURPOSE.equals(claims.get(CLAIM_PURPOSE, String.class));
        if (!purposeOk) {
            throw new ReservationException("유효하지 않은 QR 코드입니다.");
        }

        Long reservationId = claims.get(CLAIM_RESERVATION_ID_SHORT, Long.class);
        if (reservationId == null) {
            reservationId = claims.get(CLAIM_RESERVATION_ID, Long.class);
        }
        if (reservationId == null) {
            throw new ReservationException("유효하지 않은 QR 코드입니다.");
        }
        return reservationId;
    }
}
