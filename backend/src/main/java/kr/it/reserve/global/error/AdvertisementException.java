package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class AdvertisementException extends BusinessException {

    public AdvertisementException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public AdvertisementException(String message, HttpStatus status) {
        super(message, status);
    }

    public static AdvertisementException notFound() {
        return new AdvertisementException("광고를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }

    public static AdvertisementException forbidden(String message) {
        return new AdvertisementException(message, HttpStatus.FORBIDDEN);
    }
}
