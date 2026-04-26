package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class NoticeException extends BusinessException {

    public NoticeException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public NoticeException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========

    /** 404 - 공지사항을 찾을 수 없을 때 */
    public static NoticeException notFound() {
        return new NoticeException("존재하지 않는 공지사항입니다.", HttpStatus.NOT_FOUND);
    }

    /** 403 - 권한 없음 */
    public static NoticeException forbidden(String message) {
        return new NoticeException(message, HttpStatus.FORBIDDEN);
    }
}