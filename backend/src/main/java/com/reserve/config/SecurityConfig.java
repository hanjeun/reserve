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
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.client.web.HttpSessionOAuth2AuthorizationRequestRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@RequiredArgsConstructor
@Configuration
@EnableMethodSecurity  // @PreAuthorize, @PostAuthorize 등 메서드 수준 보안 활성화
@EnableWebSecurity
public class SecurityConfig {

    // CORS 허용 출처
    // 운영: reserve.it.kr, 로컬: localhost:5173
    private static final List<String> ALLOWED_ORIGINS = List.of(
            "http://localhost:5173",
            "https://reserve.it.kr",
            "https://slouching-blubber-worst.ngrok-free.dev"
    );

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
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                .authorizeHttpRequests(auth -> auth
                        // 정적 리소스 (랜딩페이지, favicon)
                        .requestMatchers("/", "/index.html", "/favicon.svg").permitAll()
                        // Health Check & Environment
                        .requestMatchers("/hc", "/env").permitAll()
                        .requestMatchers("/actuator/health").permitAll()

                        // 인증 관련 API
                        .requestMatchers("/api/auth/**", "/api/email/**", "/api/password-reset/**", "/api/token").permitAll()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**", "/login/**").permitAll()

                        // 공개 API (인증 불필요) - GET만 허용, CUD는 인증 필요
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/stores/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/reviews/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/favorites/status/**").permitAll()

                        // 예약 - 공개 조회만 허용, 나머지는 인증 필요
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/reservations/{id}").authenticated()
                        .requestMatchers("/api/reservations/**").authenticated()

                        // 웹훅 — ImprovMX 호출, JWT 인증 없음 (Secret 헤더로 검증)
                        .requestMatchers("/api/admin/mail/webhook").permitAll()

                        // 주소 검색 — 가게 등록/수정 시 비로그인도 검색 가능
                        .requestMatchers("/api/address/**").authenticated()

                        // 문의하기 작성 — 정지된 회원도 문의할 수 있어야 해서 비로그인 허용 (나머지 /api/inquiries/**는 인증 필요, 아래 anyRequest에 걸림)
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/inquiries").permitAll()

                        // 관리자 전용
                        .requestMatchers("/admin/**", "/api/business-verification/admin/**", "/api/admin/**").hasRole("ADMIN")

                        // 나머지는 인증 필요
                        .anyRequest().authenticated())

                .oauth2Login(oauth2 -> oauth2
                        // OAuth2 state 파라미터를 세션에 저장 (STATELESS 환경에서 필수)
                        .authorizationEndpoint(authorization -> authorization
                                .authorizationRequestRepository(new HttpSessionOAuth2AuthorizationRequestRepository()))
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
        // yml에서 주입 (common.yml: 운영 도메인, local.yml: localhost 추가)
        configuration.setAllowedOrigins(ALLOWED_ORIGINS);
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