package com.reserve.config;

import com.reserve.config.jwt.JwtAuthenticationFilter;
import com.reserve.config.jwt.TokenProvider;
import com.reserve.config.oauth2.CustomOAuth2UserService;
import com.reserve.config.oauth2.OAuth2AuthenticationFailureHandler;
import com.reserve.config.oauth2.OAuth2AuthenticationSuccessHandler;
import com.reserve.global.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@RequiredArgsConstructor
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final TokenProvider tokenProvider;
    private final CustomOAuth2UserService customOAuth2UserService;
    private final OAuth2AuthenticationSuccessHandler oAuth2AuthenticationSuccessHandler;
    private final OAuth2AuthenticationFailureHandler oAuth2AuthenticationFailureHandler;
    private final ObjectMapper objectMapper; // ApiResponse를 JSON으로 변환하기 위해 필요

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                .csrf(csrf -> csrf.disable())
                .httpBasic(httpBasic -> httpBasic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                .authorizeHttpRequests(auth -> auth
                        // 업로드 파일 접근 허용
                        .requestMatchers("/uploads/**").permitAll()
                        
                        // Health Check & Environment
                        .requestMatchers("/hc", "/env").permitAll()
                        .requestMatchers("/actuator/health").permitAll()
                        
                        // 인증 관련 API
                        .requestMatchers("/api/auth/**", "/api/email/**", "/api/token").permitAll()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**").permitAll()

                        // 공개 API (인증 불필요) - GET만 허용, CUD는 인증 필요
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/stores/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/reviews/**").permitAll()

                        // 예약 - 공개 조회만 허용, 나머지는 인증 필요
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/reservations/{id}").authenticated()
                        .requestMatchers("/api/reservations/**").authenticated()

                        // 관리자 전용
                        .requestMatchers("/admin/**", "/api/business-verification/admin/**").hasRole("ADMIN")
                        
                        // 나머지는 인증 필요
                        .anyRequest().authenticated())

                .oauth2Login(oauth2 -> oauth2
                        .userInfoEndpoint(userInfo -> userInfo.userService(customOAuth2UserService))
                        .successHandler(oAuth2AuthenticationSuccessHandler)
                        .failureHandler(oAuth2AuthenticationFailureHandler))

                // JWT 필터 등록
                .addFilterBefore(new JwtAuthenticationFilter(tokenProvider), UsernamePasswordAuthenticationFilter.class)

                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, authException) -> {
                            // 인증 실패 시 ApiResponse 규격으로 응답
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType("application/json;charset=UTF-8");

                            ApiResponse<Void> errorResponse = ApiResponse.error("인증이 필요한 서비스입니다.");
                            response.getWriter().write(objectMapper.writeValueAsString(errorResponse));
                        }))
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        configuration.setAllowedOrigins(List.of(
                "http://localhost:5173",  // 로컬 개발
                "https://reserve.hktech.kr"  // 배포 도메인
        ));
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    @Bean
    public BCryptPasswordEncoder bCryptPasswordEncoder() {
        return new BCryptPasswordEncoder();
    }
}