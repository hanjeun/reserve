package kr.it.reserve.waiting.error;

import kr.it.reserve.global.error.BusinessException;
import org.springframework.http.HttpStatus;

public class WaitingException extends BusinessException {
    public WaitingException(String message, HttpStatus status) {
        super(message, status);
    }
}
