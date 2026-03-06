package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class NoticeException extends BusinessException {
    public NoticeException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public NoticeException(String message, HttpStatus status) {
        super(message, status);
    }
}