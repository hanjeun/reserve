package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class PaymentException extends BusinessException {
    
    public PaymentException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public PaymentException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    /**
     * 404 NOT_FOUND - 결제 정보를 찾을 수 없을 때
     */
    public static PaymentException notFound() {
        return new PaymentException("결제 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
}