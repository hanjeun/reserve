package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class BizVerificationException extends BusinessException {
    public BizVerificationException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public BizVerificationException(String message, HttpStatus status) {
        super(message, status);
    }
}