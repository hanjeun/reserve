package kr.it.reserve.global.error;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public class ReservationException extends BusinessException {
    public enum Code { RESERVATION_CHALLENGE_UNAVAILABLE }

    private final Code code;
    
    public ReservationException(String message) {
        this(message, HttpStatus.BAD_REQUEST);
    }

    public ReservationException(String message, HttpStatus status) {
        this(message, status, null);
    }

    private ReservationException(String message, HttpStatus status, Code code) {
        super(message, status);
        this.code = code;
    }

    public static ReservationException challengeUnavailable() {
        return new ReservationException("예약 확인에 연결하지 못했어요. 잠시 후 다시 시도해주세요.",
                HttpStatus.SERVICE_UNAVAILABLE, Code.RESERVATION_CHALLENGE_UNAVAILABLE);
    }

    // 정적 팩토리 메서드
    
    /**
     * 404 NOT_FOUND - 예약을 찾을 수 없을 때
     */
    public static ReservationException notFound() {
        return new ReservationException("예약을 찾을 수 없어요.", HttpStatus.NOT_FOUND);
    }
    
    /**
     * 403 FORBIDDEN - 권한 없음
     */
    public static ReservationException forbidden(String message) {
        return new ReservationException(message, HttpStatus.FORBIDDEN);
    }
}
