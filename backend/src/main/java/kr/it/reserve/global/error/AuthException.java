package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class AuthException extends BusinessException {
    
    public AuthException(String message) {
        super(message, HttpStatus.UNAUTHORIZED);
    }

    public AuthException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    /**
     * 401 UNAUTHORIZED - 인증 실패
     */
    public static AuthException unauthorized(String message) {
        return new AuthException(message, HttpStatus.UNAUTHORIZED);
    }
    
    /**
     * 403 FORBIDDEN - 권한 없음
     */
    public static AuthException forbidden(String message) {
        return new AuthException(message, HttpStatus.FORBIDDEN);
    }
    
    /**
     * 400 BAD_REQUEST - 잘못된 요청
     */
    public static AuthException badRequest(String message) {
        return new AuthException(message, HttpStatus.BAD_REQUEST);
    }
}