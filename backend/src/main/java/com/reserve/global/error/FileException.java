package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class FileException extends BusinessException {

    // 메시지만 받을 때 (기본 500 에러)
    public FileException(String message) {
        super(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    // 메시지와 상태코드를 모두 받을 때
    public FileException(String message, HttpStatus status) {
        super(message, status);
    }
}