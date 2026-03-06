package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class StoreException extends BusinessException {

    public StoreException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public StoreException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    /**
     * 404 NOT_FOUND - 매장을 찾을 수 없을 때
     */
    public static StoreException notFound() {
        return new StoreException("매장을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    /**
     * 403 FORBIDDEN - 권한 없음
     */
    public static StoreException forbidden(String message) {
        return new StoreException(message, HttpStatus.FORBIDDEN);
    }
}