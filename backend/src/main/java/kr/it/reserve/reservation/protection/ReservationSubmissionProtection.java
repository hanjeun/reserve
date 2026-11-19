package kr.it.reserve.reservation.protection;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.util.regex.Pattern;

@Component
@RequiredArgsConstructor
public class ReservationSubmissionProtection {
    public static final String TOKEN_HEADER = "X-Reserve-Turnstile";
    private static final int MAX_TOKEN_LENGTH = 2048;
    private static final Pattern REQUEST_ID = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
    private final RateLimiter limits;
    private final TurnstileProperties properties;
    private final ReservationTurnstile turnstile;

    /** 검증 서버 호출은 예약의 회원·가게 잠금을 잡기 전에 마친다. */
    public Challenge check(long memberId, String ip, String requestId, String token) {
        String member = "member:" + memberId;
        if (!limits.tryConsume(ip, RateLimiter.Policy.RESERVATION_CREATE)
                || !limits.tryConsume(member, RateLimiter.Policy.RESERVATION_MEMBER_CREATE)) {
            throw new ReservationException("예약 요청이 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
        if (!properties.isEnabled()
                || token == null && limits.tryConsume(member, RateLimiter.Policy.RESERVATION_CHALLENGE_THRESHOLD)) return null;

        if (requestId == null || !REQUEST_ID.matcher(requestId).matches()) {
            throw new ReservationException("예약 확인을 시작하려면 페이지를 새로고침해주세요.");
        }
        if (token != null && token.length() <= MAX_TOKEN_LENGTH && !token.isBlank() && turnstile.verify(token, requestId)) return null;
        return new Challenge("RESERVATION_CHALLENGE_REQUIRED", properties.getSiteKey(), ReservationTurnstile.ACTION, requestId);
    }

    public record Challenge(String code, String siteKey, String action, String requestId) {}
}
