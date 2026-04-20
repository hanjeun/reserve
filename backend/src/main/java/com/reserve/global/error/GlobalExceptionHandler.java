package com.reserve.global.error;

import com.reserve.global.common.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 비즈니스 예외 통합 처리 (도메인별 Custom Exception들)
     */
    @ExceptionHandler(BusinessException.class)
    protected ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
        // 500대 에러는 ERROR, 400대는 WARN으로 로그 레벨 차등 적용
        if (e.getStatus().is5xxServerError()) {
            log.error(" Server Business Error [{}]: {}", e.getClass().getSimpleName(), e.getMessage(), e);
        } else {
            log.warn("⚠️ Client Business Warning [{}]: {}", e.getClass().getSimpleName(), e.getMessage());
        }

        return ResponseEntity
                .status(e.getStatus())
                .body(ApiResponse.error(e.getMessage()));
    }

    /**
     * Spring Security 권한 부족 예외 (403 Forbidden)
     * 직접 throw 하기보다 Custom Exception 사용을 권장하지만, 시큐리티 기본 흐름 대응용으로 유지
     */
    @ExceptionHandler(org.springframework.security.access.AccessDeniedException.class)
    protected ResponseEntity<ApiResponse<Void>> handleAccessDenied(org.springframework.security.access.AccessDeniedException e) {
        log.warn("Access Denied: {}", e.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("해당 리소스에 대한 접근 권한이 없습니다."));
    }

    /**
     * 예상치 못한 최상위 예외 처리 (500 Internal Server Error)
     */
    @ExceptionHandler(Exception.class)
    protected ResponseEntity<ApiResponse<Void>> handleException(Exception e) {
        log.error("Unhandled Exception 발생!", e);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요."));
    }
}