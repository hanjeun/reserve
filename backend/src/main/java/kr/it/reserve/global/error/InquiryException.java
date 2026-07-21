package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class InquiryException extends BusinessException {

    public InquiryException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public InquiryException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========

    /** 404 - 문의를 찾을 수 없을 때 */
    public static InquiryException notFound() {
        return new InquiryException("존재하지 않는 문의입니다.", HttpStatus.NOT_FOUND);
    }

    /** 403 - 권한 없음 */
    public static InquiryException forbidden(String message) {
        return new InquiryException(message, HttpStatus.FORBIDDEN);
    }
}