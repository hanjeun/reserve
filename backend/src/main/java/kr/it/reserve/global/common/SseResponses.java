package kr.it.reserve.global.common;

import kr.it.reserve.global.error.BusinessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.function.Supplier;

public final class SseResponses {
    private SseResponses() {
    }

    /** 스트림을 열기 전의 예상된 거절은 이벤트 스트림에 JSON을 쓰지 않고 상태로 반환한다. */
    public static ResponseEntity<SseEmitter> open(Supplier<SseEmitter> subscribe) {
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                    .header("X-Accel-Buffering", "no").body(subscribe.get());
        } catch (BusinessException rejected) {
            HttpStatus status = rejected.getStatus();
            if (status != HttpStatus.TOO_MANY_REQUESTS && status != HttpStatus.FORBIDDEN) {
                throw rejected;
            }
            var response = ResponseEntity.status(status).cacheControl(CacheControl.noStore());
            if (status == HttpStatus.TOO_MANY_REQUESTS) response.header(HttpHeaders.RETRY_AFTER, "5");
            return response.build();
        }
    }
}
