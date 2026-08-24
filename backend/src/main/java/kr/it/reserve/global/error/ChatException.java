package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class ChatException extends BusinessException {

    public ChatException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public ChatException(String message, HttpStatus status) {
        super(message, status);
    }
}
