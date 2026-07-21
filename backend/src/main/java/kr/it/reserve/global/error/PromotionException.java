package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class PromotionException extends BusinessException {

    public PromotionException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public PromotionException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========

    /** 404 - 홈보글을 찾을 수 없을 때 */
    public static PromotionException notFound() {
        return new PromotionException("홈보글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }

    /** 403 - 권한 없음 */
    public static PromotionException forbidden(String message) {
        return new PromotionException(message, HttpStatus.FORBIDDEN);
    }
}