package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class AuditException extends BusinessException {

    public AuditException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public AuditException(String message, HttpStatus status) {
        super(message, status);
    }

    // 정적 팩토리 메서드

    /**
     * 404 NOT_FOUND - 대상을 찾을 수 없을 때
     */
    public static AuditException notFound(String message) {
        return new AuditException(message, HttpStatus.NOT_FOUND);
    }
}
