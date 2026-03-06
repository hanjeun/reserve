package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class InquiryException extends BusinessException {
    public InquiryException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public InquiryException(String message, HttpStatus status) {
        super(message, status);
    }
}