package kr.it.reserve.config;

import kr.it.reserve.config.jwt.JwtAuthenticationFilter;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.oauth2.CustomOAuth2UserService;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationFailureHandler;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationSuccessHandler;
import kr.it.reserve.config.oauth2.TrustedOAuth2AuthorizationRequestResolver;
import kr.it.reserve.global.common.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import kr.it.reserve.config.oauth2.LoginAuthorizationRequestRepository;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.csrf.CookieCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@RequiredArgsConstructor
@Configuration
@EnableMethodSecurity  // @PreAuthorize, @PostAuthorize 등 메서드 수준 보안 활성화
@EnableWebSecurity
@Import(SiteUrls.class)
public class SecurityConfig {

    /** 허용 출처는 환경별 설정으로 분리한다. 인증 쿠키를 허용하므로 운영에 개발 출처를 섞지 않는다. */
    @Value("${cors.allowed-origins:https://reserve.it.kr}")
    private List<String> allowedOrigins;
    @Autowired private SiteUrls siteUrls;

    private final TokenProvider tokenProvider;
    private final CustomOAuth2UserService customOAuth2UserService;
    private final OAuth2AuthenticationSuccessHandler oAuth2AuthenticationSuccessHandler;
    private final OAuth2AuthenticationFailureHandler oAuth2AuthenticationFailureHandler;
    private final ObjectMapper objectMapper; // ApiResponse를 JSON으로 변환하기 위해 필요
    @Autowired private kr.it.reserve.member.service.LoginMethodService loginMethods;
    @Autowired private org.springframework.beans.factory.ObjectProvider<kr.it.reserve.global.admission.ServiceAdmissionService> serviceAdmission;
    @Autowired private org.springframework.beans.factory.ObjectProvider<kr.it.reserve.global.ratelimit.RateLimiter> entryLimiters;
    @Value("${reserve.service-admission.enabled:false}") private boolean serviceAdmissionEnabled;
    @Value("${server.env:prod}") private String serviceAdmissionEnvironment;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http, ClientRegistrationRepository registrations) throws Exception {
        CookieCsrfTokenRepository csrfTokens = new CookieCsrfTokenRepository();
        csrfTokens.setCookieName("__Host-XSRF-TOKEN");
        csrfTokens.setCookieCustomizer(cookie -> cookie.secure(true).path("/"));
        return http
                .cors(cors -> cors.configurationSource(corsConfigurationSource()))
                // SameSite와 CORS에 더해 Origin/Referer/Fetch Metadata를 한 관문에서 검사한다.
                // 신뢰할 수 없는 브라우저 요청에는 Spring의 CSRF 검증을 적용한다.
                .csrf(csrf -> csrf
                        .csrfTokenRepository(csrfTokens)
                        .requireCsrfProtectionMatcher(new BrowserCsrfMatcher(browserOrigins())))
                .httpBasic(AbstractHttpConfigurer::disable)
                .formLogin(AbstractHttpConfigurer::disable)
                .logout(AbstractHttpConfigurer::disable)
                .sessionManagement(session -> session
                        .sessionCreationPolicy(SessionCreationPolicy.STATELESS))

                .authorizeHttpRequests(auth -> auth
                        // 정적 리소스 (랜딩페이지, favicon)
                        .requestMatchers("/", "/index.html", "/favicon.svg", "/sitemap.xml").permitAll()
                        // 기존 상태 확인 경로는 최소 상태만 공개한다. 환경 정보 경로는 공개하지 않는다.
                        .requestMatchers("/hc").permitAll()
                        .requestMatchers("/actuator/health").permitAll()

                        // PortOne 웹훅 — PG 서버가 부르므로 로그인 세션이 없다. permitAll 이 맞다.
                        // 이 엔드포인트의 인증은 **본문 서명 검증**(PortoneWebhookVerifier)이 전담한다.
                        //   시크릿이 비어 있으면 전부 거부하는 fail-closed 다.
                        //   경로를 넓히지 말 것 — "/api/payment/**" 로 풀면 결제·환불 API 가 통째로 열린다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                ApiPaths.withV1Aliases("/api/payment/webhook/portone")).permitAll()
                        // 제공자 이벤트는 브라우저 세션 대신 서명된 SET 본문을 검증한다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                ApiPaths.withV1Aliases("/api/oauth/events/google", "/api/oauth/events/kakao", "/api/oauth/events/naver")).permitAll()
                        // CSP Report-Only 브라우저 진단. 인증 쿠키가 없는 브라우저도 보낼 수 있어야 한다.
                        // 본문은 CspReportController가 URL을 버리고 고정 범주만 기록한다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                ApiPaths.withV1Aliases("/api/csp-reports")).permitAll()

                        // 인증 진입점만 공개한다. agree-terms는 로그인 직후의 회원 상태를 바꾸므로
                        // /api/auth/**로 함께 열면 @AuthenticationPrincipal null 경로가 생긴다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                ApiPaths.withV1Aliases("/api/auth/login", "/api/auth/signup", "/api/auth/refresh", "/api/auth/logout"))
                                .permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/auth/login-policy", "/api/auth/session")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST, ApiPaths.withV1Aliases(
                                "/api/auth/mfa/status", "/api/auth/mfa/totp/setup", "/api/auth/mfa/totp/confirm",
                                "/api/auth/mfa/passkey/login", "/api/auth/mfa/passkey/options", "/api/auth/mfa/passkey/confirm",
                                "/api/auth/mfa/verify", "/api/auth/mfa/finish", "/api/auth/mfa/recovery",
                                "/api/auth/mfa/remove", "/api/auth/mfa/disable", "/api/auth/mfa/cancel", "/api/auth/mfa/defer")).permitAll()
                        // 가입 전 이메일 인증에 필요한 두 요청만 공개한다. 인증 상태를 이메일로
                        // 조회하는 공개 API는 계정·인증 진행 여부를 추측하게 하므로 두지 않는다.
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                ApiPaths.withV1Aliases("/api/email/send-code", "/api/email/verify-code")).permitAll()
                        .requestMatchers(ApiPaths.withV1Aliases("/api/password-reset/**")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                ApiPaths.withV1Aliases("/api/auth/agree-terms")).authenticated()
                        .requestMatchers("/oauth2/**", "/login/oauth2/**", "/login/**").permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/updates/public/events")).permitAll()

                        // 필요한 공개 GET만 허용하고 상세 ID는 숫자로 제한해 개인 경로가 매칭되지 않게 한다.
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/stores", "/api/stores/regions", "/api/stores/{id:\\d+}")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/reviews/store/{storeId:\\d+}", "/api/reviews/store/{storeId:\\d+}/stats",
                                        "/api/reviews/{id:\\d+}")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/notices", "/api/notices/highlights", "/api/notices/{id:\\d+}")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/chat/retention-policy")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/waiting/stores", "/api/waiting/retention-policy")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                ApiPaths.withV1Aliases("/api/notices/{id:\\d+}/view")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/public/store-pages/{id:\\d+}")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.HEAD,
                                ApiPaths.withV1Aliases("/api/public/store-pages/{id:\\d+}")).permitAll()
                        // 지역 사진은 공개 탐색 보조 정보다. 키·원본 URL은 서버 안에서만 처리한다.
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/tourism/region-photos/**")).permitAll()
                        // 가게 소식 v1의 최소 공개 응답만 허용한다. 기존 /my·/my-stores·CUD는 인증 유지.
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/promotions/public", "/api/promotions/public/events", "/api/promotions/public/{promotionId}")).permitAll()
                        // 공개 피드의 최소 읽기만 허용한다. me/쓰기/신고/관리자 증거는 인증을 유지한다.
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/feed/config", "/api/feed/regions", "/api/feed/posts", "/api/feed/posts/{id:\\d+}",
                                        "/api/feed/interactions/config", "/api/feed/likes/{type:POST|NEWS|COMMENT}/{id:\\d+}", "/api/feed/comments/{id:\\d+}",
                                        "/api/feed/posts/{id:\\d+}/comments", "/api/feed/comments/{id:\\d+}/replies",
                                        "/api/feed/authors/{publicId:[0-9a-fA-F\\-]{36}}",
                                        "/api/feed/authors/{publicId:[0-9a-fA-F\\-]{36}}/posts",
                                        "/api/feed/media/{id:\\d+}")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/store-news/config", "/api/store-news/media/{id:\\d+}")).permitAll()
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/favorites/status/**")).permitAll()
                        // 실시간 잔여 슬롯 조회 — 로그인 여부와 무관하게 누구나 시간대만 볼 수 있어야 함
                        // (실제 예약 생성은 여전히 아래 "/api/reservations/**" 규칙에 걸려 인증 필요 — 미로그인 사용자는
                        //  '예약하기' 버튼 클릭 시 프론트에서 isLoggedIn 체크 후 로그인 안내로 자연스럽게 유도됨)
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/reservations/availability")).permitAll()
                        // 달력(월 단위)도 같은 성격의 공개 조회다 — 예약 가능 여부는 로그인 전에 보여야 고를 수 있다.
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/reservations/calendar")).permitAll()
                        // 공휴일 목록 — 가게 등록 폼 달력(가게 id 없음)이 빨간날을 칠하는 색칠 전용 공개 조회다.
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/holidays")).permitAll()

                        // 광고 노출 목록 — 공개 API (StoreList 배지/배너 위젯이 로그인 여부와 무관하게 보여야 함)
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/advertisements/active")).permitAll()
                        // 노출·클릭은 비로그인 방문자에게도 일어나므로 공개·IP 제한을 유지한다.
                        // 전환은 회원 본인의 예약과 광고 가게를 대조해야 하므로 아래 anyRequest 인증 규칙을 탄다.
                        .requestMatchers(org.springframework.http.HttpMethod.PATCH,
                                ApiPaths.withV1Aliases("/api/advertisements/*/impression", "/api/advertisements/*/click"))
                                .permitAll()

                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/search")).permitAll()

                        // 예약 - 공개 조회만 허용, 나머지는 인증 필요
                        .requestMatchers(org.springframework.http.HttpMethod.GET,
                                ApiPaths.withV1Aliases("/api/reservations/{id}")).authenticated()
                        .requestMatchers(ApiPaths.withV1Aliases("/api/reservations/admin/**")).hasRole("ADMIN")
                        .requestMatchers(ApiPaths.withV1Aliases("/api/reservations/**")).authenticated()

                        // 서버 API 키와 호출 한도를 보호하기 위해 주소 검색은 로그인이 필요하다.
                        .requestMatchers(ApiPaths.withV1Aliases("/api/address/**")).authenticated()

                        // 문의하기 작성 — 정지된 회원도 문의할 수 있어야 해서 비로그인 허용 (나머지 /api/inquiries/**는 인증 필요, 아래 anyRequest에 걸림)
                        .requestMatchers(org.springframework.http.HttpMethod.POST,
                                ApiPaths.withV1Aliases("/api/inquiries")).permitAll()

                        // 관리자 전용
                        .requestMatchers(ApiPaths.withV1Aliases("/admin/**", "/api/business-verification/admin/**", "/api/admin/**"))
                                .hasRole("ADMIN")

                        // 나머지는 인증 필요
                        .anyRequest().authenticated())

                .oauth2Login(oauth2 -> oauth2
                        // OAuth2 state 파라미터를 세션에 저장 (STATELESS 환경에서 필수)
                        .authorizationEndpoint(authorization -> authorization
                                .authorizationRequestResolver(new TrustedOAuth2AuthorizationRequestResolver(registrations, siteUrls.oauthOrigins(browserOrigins()), loginMethods))
                                .authorizationRequestRepository(new LoginAuthorizationRequestRepository()))
                        .userInfoEndpoint(userInfo -> userInfo.userService(customOAuth2UserService))
                        .successHandler(oAuth2AuthenticationSuccessHandler)
                        .failureHandler(oAuth2AuthenticationFailureHandler))

                // JWT 필터 등록
                .addFilterBefore(new JwtAuthenticationFilter(tokenProvider), UsernamePasswordAuthenticationFilter.class)
                // firewall·CORS 이후, 인증·CSRF 전에 미지원 API 버전만 404로 종료한다.
                .addFilterBefore(new UnsupportedApiVersionFilter(objectMapper), CsrfFilter.class)
                // CORS·CSRF 뒤, JWT 회원·세션 DB 조회 앞에서 입장 여부를 처리한다.
                .addFilterAfter(new kr.it.reserve.config.ServiceAdmissionHttpFilter(serviceAdmission,
                        entryLimiters, objectMapper, serviceAdmissionEnabled, serviceAdmissionEnvironment), CsrfFilter.class)

                .exceptionHandling(exceptions -> exceptions
                        .authenticationEntryPoint((request, response, authException) -> {
                            // 인증 실패 시 ApiResponse 규격으로 응답
                            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                            response.setContentType("application/json;charset=UTF-8");

                            ApiResponse<Void> errorResponse = ApiResponse.error("인증이 필요한 서비스예요.");
                            response.getWriter().write(objectMapper.writeValueAsString(errorResponse));
                        }))
                .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        // 프로파일별 yml에서 주입 (local.yml: localhost·ngrok 포함 / prod.yml: 운영 도메인만)
        configuration.setAllowedOrigins(browserOrigins());
        configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        configuration.setAllowedHeaders(List.of("*"));
        configuration.setExposedHeaders(List.of("Retry-After"));
        configuration.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    private List<String> browserOrigins() { return siteUrls == null ? allowedOrigins : siteUrls.browserOrigins(allowedOrigins); }

    @Bean
    public BCryptPasswordEncoder bCryptPasswordEncoder() {
        return new BCryptPasswordEncoder();
    }
}
