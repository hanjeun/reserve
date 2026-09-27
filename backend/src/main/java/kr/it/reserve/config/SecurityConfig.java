package kr.it.reserve.config;

import kr.it.reserve.config.jwt.JwtAuthenticationFilter;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.oauth2.CustomOAuth2UserService;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationFailureHandler;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationSuccessHandler;
import kr.it.reserve.global.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
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

    /**
     * CORS 허용 출처 — 프로파일별 yml에서 주입한다(쉼표 구분).
     *
     *  - local  : localhost:5173 + reserve.it.kr + ngrok(실기기 테스트)  → application-local.yml
     *  - prod   : reserve.it.kr 만                                      → application-prod.yml
     *
     * 예전엔 이 목록이 코드에 하드코딩돼 있어 ngrok 테스트 도메인이 운영에도 들어가 있었다.
     * allowCredentials=true와 함께라면 그 도메인이 우리 쿠키를 읽을 수 있으므로 환경 분리가 필수다.
     *
     * 기본값은 운영 도메인 — 테스트 컨텍스트처럼 이 키가 없는 환경에서도 뜨게 하기 위한 것이며,
     * 실제 환경은 위 두 yml이 항상 값을 제공한다.
     */
    @Value("${cors.allowed-origins:https://reserve.it.kr}")
    private List<String> allowedOrigins;

    private final TokenProvider tokenProvider;
    private final CustomOAuth2UserService customOAuth2UserService;
    private final OAuth2AuthenticationSuccessHandler oAuth2AuthenticationSuccessHandler;
    private final OAuth2AuthenticationFailureHandler oAuth2AuthenticationFailureHandler;
    private final ObjectMapper objectMapper; // ApiResponse를 JSON으로 변환하기 위해 필요

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                // CSRF 토큰을 쓰지 않는 대신 SameSite=Lax 쿠키가 방어선이다(CookieUtil 참고).
                // 인증 토큰은 Authorization 헤더 또는 쿠키로 오는데(JwtAuthenticationFilter.resolveToken),
                // 쿠키 경로가 있는 이상 cross-site 요청에 쿠키가 붙지 않도록 막는 쪽이 핵심이다.
                // Lax는 cross-site POST/PUT/PATCH/DELETE에 쿠키를 보내지 않으므로 상태 변경 요청이 차단된다.
                // ⚠️ CookieUtil의 SameSite를 None으로 되돌리면 이 방어가 통째로 사라진다.
                .csrf(csrf -> csrf.disable())
                .httpBasic(httpBasic -> httpBasic.disable())
                .formLogin(form -> form.disable())
                .logout(logout -> logout.disable())
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                .authorizeHttpRequests(auth -> auth
                        // 정적 리소스 (랜딩페이지, favicon)
                        .requestMatchers("/", "/index.html", "/favicon.svg", "/sitemap.xml").permitAll()
                        // 기존 상태 확인 경로는 최소 상태만 공개한다. 환경 정보 경로는 공개하지 않는다.
                        .requestMatchers("/hc").permitAll()
                        .requestMatchers("/actuator/health").permitAll()

                        // PortOne 웹훅 — PG 서버가 부르므로 로그인 세션이 없다. permitAll 이 맞다.
                        // ★ 이 엔드포인트의 인증은 **본문 서명 검증**(PortoneWebhookVerifier)이 전담한다.
                        //   시크릿이 비어 있으면 전부 거부하는 fail-closed 다.
                        //   경로를 넓히지 말 것 — "/api/payment/**" 로 풀면 결제·환불 API 가 통째로 열린다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/payment/webhook/portone").permitAll()
                        // CSP Report-Only 브라우저 진단. 인증 쿠키가 없는 브라우저도 보낼 수 있어야 한다.
                        // 본문은 CspReportController가 URL을 버리고 고정 범주만 기록한다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/csp-reports").permitAll()

                        // 인증 진입점만 공개한다. agree-terms는 로그인 직후의 회원 상태를 바꾸므로
                        // /api/auth/**로 함께 열면 @AuthenticationPrincipal null 경로가 생긴다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                "/api/auth/login", "/api/auth/signup", "/api/auth/refresh", "/api/auth/logout")
                                .permitAll()
                        // 가입 전 이메일 인증에 필요한 두 요청만 공개한다. 인증 상태를 이메일로
                        // 조회하는 공개 API는 계정·인증 진행 여부를 추측하게 하므로 두지 않는다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                "/api/email/send-code", "/api/email/verify-code").permitAll()
                        .requestMatchers("/api/password-reset/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/auth/agree-terms").authenticated()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**", "/login/**").permitAll()

                        // 공개 API — 공개 화면이 실제로 쓰는 GET 만 연다(2026-09-21).
                        // 예전엔 /api/stores/**·/api/reviews/**·/api/notices/** 를 통째로 열어서 새 GET 을 추가하는 순간
                        // 자동으로 공개됐다. /my·/{id}/edit·/{id}/statistics 같은 개인 조회는 컨트롤러 코드 한 겹에만 기댔고,
                        // /api/reviews/reservation/{id} 는 그 한 겹조차 없어 예약 번호만으로 남의 리뷰를 꺼낼 수 있었다.
                        // 상세 경로는 숫자만 받는다 — /my 같은 경로가 {id} 로 잘못 매칭돼 공개되지 않게.
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                "/api/stores", "/api/stores/regions", "/api/stores/{id:\\d+}").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                "/api/reviews/store/{storeId:\\d+}", "/api/reviews/store/{storeId:\\d+}/stats",
                                "/api/reviews/{id:\\d+}").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                "/api/notices", "/api/notices/highlights", "/api/notices/{id:\\d+}").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/notices/{id:\\d+}/view").permitAll()
                        // 지역 사진은 공개 탐색 보조 정보다. 키·원본 URL은 서버 안에서만 처리한다.
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/tourism/region-photos/**").permitAll()
                        // 가게 소식 v1의 최소 공개 응답만 허용한다. 기존 /my·/my-stores·CUD는 인증 유지.
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                "/api/promotions/public", "/api/promotions/public/{promotionId}").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/favorites/status/**").permitAll()
                        // 실시간 잔여 슬롯 조회 — 로그인 여부와 무관하게 누구나 시간대만 볼 수 있어야 함
                        // (실제 예약 생성은 여전히 아래 "/api/reservations/**" 규칙에 걸려 인증 필요 — 미로그인 사용자는
                        //  '예약하기' 버튼 클릭 시 프론트에서 isLoggedIn 체크 후 로그인 안내로 자연스럽게 유도됨)
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/reservations/availability").permitAll()
                        // 달력(월 단위)도 같은 성격의 공개 조회다 — 예약 가능 여부는 로그인 전에 보여야 고를 수 있다.
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/reservations/calendar").permitAll()

                        // 광고 노출 목록 — 공개 API (StoreList 배지/배너 위젯이 로그인 여부와 무관하게 보여야 함)
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/advertisements/active").permitAll()
                        // 노출·클릭은 비로그인 방문자에게도 일어나므로 공개·IP 제한을 유지한다.
                        // 전환은 회원 본인의 예약과 광고 가게를 대조해야 하므로 아래 anyRequest 인증 규칙을 탄다.
                        .requestMatchers(org.springframework.http.HttpMethod.PATCH,
                                "/api/advertisements/*/impression", "/api/advertisements/*/click")
                                .permitAll()

                        // 예약 - 공개 조회만 허용, 나머지는 인증 필요
                        .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/reservations/{id}").authenticated()
                        .requestMatchers("/api/reservations/**").authenticated()

                        // 주소 검색 (Kakao Local API 서버사이드 프록시)
                        // 2026-07 전수조사: 예전 주석은 "비로그인도 검색 가능"이라고 되어 있었지만 실제 매처는
                        // authenticated()라 서로 반대 얘기를 하고 있었음. 확인 결과 코드가 맞다 —
                        //  1) /api/address/search를 호출하는 곳은 프론트의 AddressSearch.jsx 하나뿐이고,
                        //     그걸 쓰는 화면은 MyPage(/my-page)와 가게 등록/수정(/store/register, /store/{id}/edit)로
                        //     전부 로그인(가게 쪽은 BUSINESS)이 필요한 라우트라 비로그인 호출 경로가 존재하지 않는다.
                        //  2) 이 엔드포인트는 서버가 보관한 Kakao REST 키로 카카오 API를 프록시하는 것이라
                        //     permitAll이면 누구나 우리 카카오 쿼터를 무료 지오코딩 서비스로 소진시킬 수 있다.
                        // → authenticated() 유지, 사실과 다른 주석만 제거.
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
        // 프로파일별 yml에서 주입 (local.yml: localhost·ngrok 포함 / prod.yml: 운영 도메인만)
        configuration.setAllowedOrigins(allowedOrigins);
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
