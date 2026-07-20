package com.reserve.global.error;

import org.springframework.http.HttpStatus;

/**
 * 감사 로그 / 휴지통(소프트 삭제·복구) 도메인 예외.
 *
 * 2026-07 전수조사로 신설 — AuditLogService가 이 도메인 전용 예외가 없어서
 * IllegalArgumentException을 직접 던지고 있었다. GlobalExceptionHandler는
 * BusinessException 계열만 상태 코드에 맞게 처리하고, 그 외의 표준 Java 예외는
 * 전부 최상위 Exception 핸들러(500)로 떨어진다 — 그래서 "휴지통 항목을 찾을 수 없음"
 * 같은 명백한 404/400 상황이 사용자에게는 "서버 내부 오류"로 잘못 보이고 있었다.
 * 다른 모든 도메인(Member/Store/Reservation 등)과 동일한 컨벤션으로 통일한다.
 */
public class AuditException extends BusinessException {

    public AuditException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public AuditException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========

    /**
     * 404 NOT_FOUND - 대상을 찾을 수 없을 때
     */
    public static AuditException notFound(String message) {
        return new AuditException(message, HttpStatus.NOT_FOUND);
    }
}
