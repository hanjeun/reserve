package com.reserve.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * WebMvc 설정
 * 이미지는 S3 + CloudFront로 서빙하므로 로컬 파일 핸들러 불필요
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {
}