package kr.it.reserve.config.oauth2.events;

import org.springframework.http.HttpStatus;

/** 공급자 응답에 요청 원문·클레임·키·내부 예외를 노출하지 않는다. */
public class OAuthSecurityEventException extends RuntimeException {
    private final String code;
    private final HttpStatus status;

    public OAuthSecurityEventException(String code, HttpStatus status) {
        super(code);
        this.code = code;
        this.status = status;
    }

    public String code() { return code; }
    public HttpStatus status() { return status; }

    static OAuthSecurityEventException invalid(String code) {
        return new OAuthSecurityEventException(code, HttpStatus.BAD_REQUEST);
    }

    static OAuthSecurityEventException unavailable() {
        return new OAuthSecurityEventException("temporarily_unavailable", HttpStatus.SERVICE_UNAVAILABLE);
    }
}
