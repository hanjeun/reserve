package kr.it.reserve.global.error;

import kr.it.reserve.global.common.ApiResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.servlet.NoHandlerFoundException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    /**
     * 회원 정지/영구정지 로그인 차단
     * 구조화된 정지 정보(status/until/reason)를 ApiResponse.data로 포함하여 프론트엔드에 전달.
     * 이메일 로그인은 URL 리다이렉션이 아닌 일반 JSON 응답이므로
     * 메시지 인코딩/길이 제한 없이 사유 등 정보를 온전히 담을 수 있음.
     */
    @ExceptionHandler(MemberSuspendedException.class)
    protected ResponseEntity<ApiResponse<Map<String, String>>> handleMemberSuspended(MemberSuspendedException e) {
        log.warn("Login blocked (suspended): status={}, until={}", e.getSuspendStatus(), e.getSuspendedUntil());

        Map<String, String> data = new HashMap<>();
        data.put("status", e.getSuspendStatus());
        if (e.getSuspendedUntil() != null) data.put("until", e.getSuspendedUntil());
        if (e.getReason() != null) data.put("reason", e.getReason());

        return ResponseEntity
                .status(e.getStatus())
                .body(ApiResponse.<Map<String, String>>builder()
                        .success(false)
                        .message(e.getMessage())
                        .data(data)
                        .build());
    }

    /**
     * 비즈니스 예외 통합 처리 (도메인별 Custom Exception들)
     */
    @ExceptionHandler(BusinessException.class)
    protected ResponseEntity<ApiResponse<Void>> handleBusinessException(BusinessException e) {
        // 500대 에러는 ERROR, 400대는 WARN으로 로그 레벨 차등 적용
        if (e.getStatus().is5xxServerError()) {
            log.error("Server business error: type={}, status={}",
                    e.getClass().getSimpleName(), e.getStatus().value());
        } else {
            log.warn("Client business warning: type={}, status={}",
                    e.getClass().getSimpleName(), e.getStatus().value());
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
        log.warn("Access denied");
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResponse.error("해당 리소스에 대한 접근 권한이 없습니다."));
    }

    /**
     * 존재하지 않는 경로 (404 Not Found)
     *
     * 이 핸들러가 없으면 아래 Exception.class 캐치올에 걸려 404가 500으로 나가고,
     * log.error + 스택트레이스가 남는다. 스캐너가 랜덤 경로를 긁는 것만으로
     * ERROR 로그와 Sentry가 도배돼 진짜 장애가 묻힌다(실제로 겪은 증상).
     *
     * NoResourceFoundException: 정적 리소스 미존재 (Spring Boot 3.2+ 기본 경로)
     * NoHandlerFoundException : throw-exception-if-no-handler-found=true 일 때의 컨트롤러 미매핑
     *
     * 공격이 아닌 정상적인 오탈자·캐시된 옛 클라이언트도 여기 걸리므로 WARN 한 줄만 남긴다.
     * 요청 경로는 남기되 예외 스택은 남기지 않는다(정보량 대비 노이즈가 크다).
     */
    @ExceptionHandler({NoResourceFoundException.class, NoHandlerFoundException.class})
    protected ResponseEntity<ApiResponse<Void>> handleNotFound(Exception e) {
        log.warn("No handler found: errorType={}", e.getClass().getSimpleName());
        return ResponseEntity
                .status(HttpStatus.NOT_FOUND)
                .body(ApiResponse.error("요청하신 경로를 찾을 수 없습니다."));
    }

    /**
     * 예상치 못한 최상위 예외 처리 (500 Internal Server Error)
     */
    @ExceptionHandler(Exception.class)
    protected ResponseEntity<ApiResponse<Void>> handleException(Exception e) {
        log.error("Unhandled exception occurred", e);
        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResponse.error("서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요."));
    }
}
