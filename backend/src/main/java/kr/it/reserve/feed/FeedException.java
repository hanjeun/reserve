package kr.it.reserve.feed;

import kr.it.reserve.global.error.BusinessException;
import org.springframework.http.HttpStatus;

public class FeedException extends BusinessException {
    public FeedException(String message, HttpStatus status) { super(message, status); }
    public static FeedException missing() { return new FeedException("게시물을 찾을 수 없어요.", HttpStatus.NOT_FOUND); }
    public static FeedException invalid(String message) { return new FeedException(message, HttpStatus.BAD_REQUEST); }
}
