# 🧹 Thymeleaf → React 전환 정리 보고서

> 작성일: 2026-01-31  
> 작업: Thymeleaf 관련 리소스 제거 및 React 전용 백엔드로 전환

---

## ✅ 삭제된 항목

### 1. 디렉토리 삭제
```
src/main/resources/
├── templates/           ❌ 삭제 (모든 HTML 파일)
│   ├── admin/
│   ├── fragments/
│   ├── layouts/
│   ├── payment/
│   └── *.html (20+ 파일)
│
└── static/              ❌ 삭제 (모든 정적 리소스)
    ├── css/
    ├── js/
    ├── vendor/
    └── favicon.svg
```

**삭제된 파일 수**: 약 30+ 파일

### 2. Gradle 의존성 제거

**Before:**
```gradle
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-thymeleaf'
    implementation 'nz.net.ultraq.thymeleaf:thymeleaf-layout-dialect:3.3.0'
    // ...
}
```

**After:**
```gradle
dependencies {
    // Thymeleaf 관련 의존성 제거됨
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
    // ...
}
```

### 3. application-common.yml 정리

**Before:**
```yaml
spring:
  # Thymeleaf
  thymeleaf:
    cache: false
    prefix: classpath:/templates/
```

**After:**
```yaml
spring:
  # Thymeleaf 설정 제거됨
```

---

## 🔧 수정된 항목

### 1. SecurityConfig.java

**변경 사항:**
- 정적 리소스 경로 제거 (`/static/**`, `/css/**`, `/js/**`, `/images/**`)
- Thymeleaf 페이지 경로 제거 (`/`, `/user/login`, `/user/signup`)
- API 중심으로 간소화
- `/uploads/**` 경로만 유지 (파일 업로드용)

**Before:**
```java
.requestMatchers("/static/**", "/css/**", "/js/**", "/images/**", "/uploads/**", "/favicon.ico").permitAll()
.requestMatchers("/", "/user/login", "/user/signup").permitAll()
```

**After:**
```java
.requestMatchers("/uploads/**").permitAll()
// API 경로만 허용
```

### 2. OAuth2AuthenticationSuccessHandler.java

**변경 사항:**
- 로그인 성공 시 리다이렉트 URL을 React 앱으로 변경

**Before:**
```java
String targetUrl = determineTargetUrl(request, response, authentication);
```

**After:**
```java
String redirectUrl = "http://localhost:5173/oauth2/callback";
getRedirectStrategy().sendRedirect(request, response, redirectUrl);
```

### 3. OAuth2AuthenticationFailureHandler.java

**변경 사항:**
- 로그인 실패 시 리다이렉트 URL을 React 앱으로 변경

**Before:**
```java
String targetUrl = "/user/login?error=oauth2&message=" + errorMessage;
```

**After:**
```java
String targetUrl = "http://localhost:5173/login?error=oauth2&message=" + errorMessage;
```

### 4. SecurityConfig - OAuth2 로그인 페이지 설정 제거

**Before:**
```java
.oauth2Login(oauth2 -> oauth2
    .loginPage("/user/login")  // ❌ Thymeleaf 페이지
    .userInfoEndpoint(...)
)
```

**After:**
```java
.oauth2Login(oauth2 -> oauth2
    .userInfoEndpoint(...)  // loginPage 설정 제거
)
```

---

## 🎯 현재 상태

### 남아있는 리소스 파일
```
src/main/resources/
├── application.yml
├── application-common.yml
├── application-local.yml
├── application-prod.yml
├── application-blue.yml
├── application-green.yml
└── application-secret.yml
```

### 백엔드 역할
- **REST API 서버 전용**
- **파일 업로드/다운로드** (`/uploads/**`)
- **OAuth2 인증 처리** (토큰 발급 후 React로 리다이렉트)
- **JWT 토큰 관리**

### 프론트엔드 (React)
- **위치**: `http://localhost:5173`
- **OAuth2 콜백**: `/oauth2/callback`
- **로그인 페이지**: `/login`

---

## 🔄 변경 영향도

### ✅ 영향 없음
- 모든 REST API 엔드포인트는 그대로 동작
- JWT 인증 로직 변경 없음
- 데이터베이스 연동 변경 없음
- 파일 업로드 기능 유지

### ⚠️ 확인 필요
1. **OAuth2 리다이렉트 URL**
   - React 앱에서 `/oauth2/callback` 라우트 구현 필요
   - 쿠키에서 `access_token`, `refresh_token` 읽어서 저장

2. **CORS 설정**
   - 현재: `http://localhost:5173` 허용
   - 운영 환경: 실제 도메인으로 변경 필요

3. **환경별 리다이렉트 URL**
   ```java
   // 개발: http://localhost:5173
   // 운영: https://your-domain.com
   ```

---

## 📝 추가 작업 권장사항

### 1. OAuth2 리다이렉트 URL 환경 변수화

**현재:**
```java
String redirectUrl = "http://localhost:5173/oauth2/callback";
```

**권장:**
```java
@Value("${app.oauth2.redirect-uri}")
private String oauth2RedirectUri;

// application.yml
app:
  oauth2:
    redirect-uri: http://localhost:5173/oauth2/callback  # 로컬
    # redirect-uri: https://your-domain.com/oauth2/callback  # 운영
```

### 2. CORS 설정 환경 변수화

**현재:**
```java
configuration.setAllowedOrigins(List.of("http://localhost:5173"));
```

**권장:**
```java
@Value("${app.cors.allowed-origins}")
private String[] allowedOrigins;

// application.yml
app:
  cors:
    allowed-origins: http://localhost:5173  # 로컬
    # allowed-origins: https://your-domain.com  # 운영
```

### 3. SecurityConfig 최종 정리

불필요한 설정 제거:
```java
// ❌ 제거 가능
.sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
// OAuth2 로그인은 세션이 필요 없음 (JWT 사용)

// ✅ 유지
.formLogin(form -> form.disable())
.httpBasic(httpBasic -> httpBasic.disable())
```

---

## 🚀 다음 단계

### Immediate (완료)
- ✅ Thymeleaf 의존성 제거
- ✅ 템플릿 파일 삭제
- ✅ 정적 리소스 삭제
- ✅ SecurityConfig 정리
- ✅ OAuth2 핸들러 수정

### Short Term (이번 주)
- ⏳ OAuth2 리다이렉트 URL 환경 변수화
- ⏳ CORS 설정 환경 변수화
- ⏳ React 앱에서 OAuth2 콜백 처리 구현
- ⏳ 테스트 (로그인, API 호출)

### Long Term (다음 주 ~)
- ⏳ 운영 환경 설정 추가
- ⏳ API 문서 업데이트
- ⏳ 배포 스크립트 수정

---

## 💾 백업 정보

삭제된 파일들은 Git 히스토리에 남아있으므로 필요 시 복구 가능합니다.

```bash
# 삭제 전 커밋으로 되돌리기
git log --oneline  # 커밋 해시 확인
git checkout <commit-hash> -- src/main/resources/templates
```

---

## 📊 최종 체크리스트

### 백엔드
- [x] Thymeleaf 의존성 제거
- [x] 템플릿 파일 삭제
- [x] 정적 리소스 삭제
- [x] SecurityConfig API 전용으로 정리
- [x] OAuth2 핸들러 React 리다이렉트로 수정
- [ ] 환경 변수화 (OAuth2, CORS)

### 프론트엔드 (React)
- [ ] OAuth2 콜백 페이지 구현
- [ ] 쿠키에서 JWT 토큰 읽기
- [ ] 로그인 실패 처리
- [ ] API 호출 테스트

### 배포
- [ ] 운영 환경 설정 추가
- [ ] Docker 이미지 빌드 테스트
- [ ] Blue-Green 배포 스크립트 수정

---

**작성자**: Claude  
**완료 시간**: 2026-01-31  
**다음 작업**: 환경 변수화 및 React 앱 연동 테스트