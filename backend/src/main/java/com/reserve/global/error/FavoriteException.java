package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class FavoriteException extends BusinessException {
    
    public FavoriteException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public FavoriteException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    public static FavoriteException notFound() {
        return new FavoriteException("매장을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
}