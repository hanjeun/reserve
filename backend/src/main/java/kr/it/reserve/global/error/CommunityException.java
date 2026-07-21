package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class CommunityException extends BusinessException {

    public CommunityException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public CommunityException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========

    /** 404 - 게시글을 찾을 수 없을 때 */
    public static CommunityException postNotFound() {
        return new CommunityException("게시글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }

    /** 404 - 댓글을 찾을 수 없을 때 */
    public static CommunityException commentNotFound() {
        return new CommunityException("댓글을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }

    /** 403 - 권한 없음 */
    public static CommunityException forbidden(String message) {
        return new CommunityException(message, HttpStatus.FORBIDDEN);
    }
}