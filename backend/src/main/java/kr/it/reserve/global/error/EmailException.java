package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class EmailException extends BusinessException {
    
    public EmailException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public EmailException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    public static EmailException notFound() {
        return new EmailException("인증 요청 내역을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    public static EmailException expired(String message) {
        return new EmailException(message, HttpStatus.GONE);
    }
}