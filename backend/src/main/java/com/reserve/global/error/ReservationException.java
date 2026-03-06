package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class ReservationException extends BusinessException {
    
    public ReservationException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public ReservationException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    /**
     * 404 NOT_FOUND - 예약을 찾을 수 없을 때
     */
    public static ReservationException notFound() {
        return new ReservationException("예약을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    /**
     * 403 FORBIDDEN - 권한 없음
     */
    public static ReservationException forbidden(String message) {
        return new ReservationException(message, HttpStatus.FORBIDDEN);
    }
}