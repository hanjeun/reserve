package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class BizVerificationException extends BusinessException {

    public BizVerificationException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public BizVerificationException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========

    public static BizVerificationException notFound() {
        return new BizVerificationException("해당 인증 요청을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }

    public static BizVerificationException memberNotFound() {
        return new BizVerificationException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }

    public static BizVerificationException forbidden(String message) {
        return new BizVerificationException(message, HttpStatus.FORBIDDEN);
    }

    public static BizVerificationException conflict(String message) {
        return new BizVerificationException(message, HttpStatus.CONFLICT);
    }
}