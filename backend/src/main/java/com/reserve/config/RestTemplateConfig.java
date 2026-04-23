package com.reserve.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestTemplate;

/**
 * RestTemplate 설정
 * - connectTimeout : 외부 서버 연결 최대 대기 시간
 * - readTimeout    : 응답 데이터 수신 최대 대기 시간
 * 사용처: PortoneService (결제 조회/취소), OAuthUnlinkService (소셜 연결 해제)
 */
@Configuration
public class RestTemplateConfig {

    @Bean
    public RestTemplate restTemplate() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(5_000);   // 연결 5초
        factory.setReadTimeout(10_000);     // 읽기 10초
        return new RestTemplate(factory);
    }
}
