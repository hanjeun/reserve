package kr.it.reserve.common;

import kr.it.reserve.global.common.ApiResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.TreeMap;

@RestController
public class HealthCheckController {

    @Value("${server.env}")
    private String env;

    @Value("${server.port}")
    private String serverPort;

    @Value("${server.serverAddress}")
    private String serverAddress;

    @Value("${serverName}")
    private String serverName;

    /**
     * 서버 상태 확인 (Health Check)
     */
    @GetMapping("/hc")
    public ApiResponse<Map<String, String>> healthCheck() {
        Map<String, String> responseData = new TreeMap<>();
        responseData.put("serverName", serverName);
        responseData.put("serverAddress", serverAddress);
        responseData.put("serverPort", serverPort);
        responseData.put("env", env);

        return ApiResponse.success(responseData, "Server is running");
    }

    /**
     * 현재 실행 환경 확인
     */
    @GetMapping("/env")
    public String getEnv() {
        return env;
    }
}