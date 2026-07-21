package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class ReviewException extends BusinessException {
    
    public ReviewException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public ReviewException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    public static ReviewException notFound() {
        return new ReviewException("리뷰를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    public static ReviewException forbidden(String message) {
        return new ReviewException(message, HttpStatus.FORBIDDEN);
    }
}