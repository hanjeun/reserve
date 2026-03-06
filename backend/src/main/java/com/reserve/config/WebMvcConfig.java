package com.reserve.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Value("${file.upload-dir:uploads}")
    private String uploadDir;

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // 절대 경로 변환 시 시스템 독립적으로 처리될 수 있도록 normalize() 사용
        Path uploadPath = Paths.get(uploadDir).toAbsolutePath().normalize();
        String uploadPathString = uploadPath.toUri().toString();

        registry.addResourceHandler("/uploads/**")
                .addResourceLocations(uploadPathString);
    }
}