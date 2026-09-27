package kr.it.reserve.common;

import kr.it.reserve.global.common.ApiResponse;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class HealthCheckController {

    /**
     * 이전 경로를 쓰는 외부 상태 확인과의 호환용 최소 응답.
     * 상세 환경·호스트·포트 확인은 인증 없이 공개하지 않는다.
     */
    @GetMapping("/hc")
    public ApiResponse<Map<String, String>> healthCheck() {
        return ApiResponse.success(Map.of("status", "UP"), "Server is running");
    }
}
