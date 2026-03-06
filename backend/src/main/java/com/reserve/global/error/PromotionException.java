package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class PromotionException extends BusinessException {
    public PromotionException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public PromotionException(String message, HttpStatus status) {
        super(message, status);
    }
}