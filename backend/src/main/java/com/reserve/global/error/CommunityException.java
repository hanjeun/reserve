package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class CommunityException extends BusinessException {
    public CommunityException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public CommunityException(String message, HttpStatus status) {
        super(message, status);
    }
}