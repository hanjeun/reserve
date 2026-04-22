# RESERVE

> 식당 예약 플랫폼 — Spring Boot 3 + React 19 풀스택 프로젝트

🌐 **[reserve.it.kr](https://reserve.it.kr)**

---

## 기술 스택

| 영역 | 기술 |
|---|---|
| **Backend** | Spring Boot 3.5.6, Java 21, MySQL 8.0, Spring Security, JWT, OAuth2 |
| **Frontend** | React 19, Vite, Ant Design 5, React Query 5, Zustand |
| **인프라** | AWS Lightsail, Docker, Nginx, GitHub Actions (Blue/Green) |
| **스토리지** | AWS S3 + CloudFront (이미지 CDN) |
| **이메일** | Resend SMTP |
| **결제** | 포트원 V2 (카카오페이) |
| **소셜 로그인** | Google, Naver, Kakao OAuth2 |

---

## 주요 기능

### 일반 사용자
- 소셜 로그인 (Google / Naver / Kakao) + 이메일 회원가입
- 가게 목록 검색 · 정렬 · 즐겨찾기
- 예약 생성 · 노쇼 예약금 결제 (카카오페이)
- 리뷰 작성 · 수정 · 삭제
- 마이페이지 (프로필 이미지, 이름, 비밀번호 변경)
- 비밀번호 재설정 (이메일 인증)

### 사업자 (BUSINESS)
- 가게 등록 · 수정 · 삭제 (이미지 S3 업로드)
- 예약 승인 / 거절 / 완료 / 노쇼 처리
- 예약 자동 승인, 예약금 설정, 환불 정책 설정
- 사업자 인증 신청 (사업자 등록증 업로드)
- 예약 알림 메일 수신 설정

### 관리자 (ADMIN)
- 사업자 인증 심사 (승인 / 거절)
- 전체 예약 · 회원 조회

---

## 아키텍처

```
사용자
  │
  ▼
Nginx (80/443) ──── Let's Encrypt SSL
  │
  ├── /api/*         → Spring Boot (Blue/Green)
  ├── /oauth2/*      → Spring Boot
  └── /*             → React SPA (정적 파일)

Spring Boot ──── MySQL 8.0
            └─── AWS S3 (이미지)
                  └─── CloudFront (cdn.reserve.it.kr)
```

### Blue/Green 배포 흐름

```
main push
  → GitHub Actions
    → 백엔드 빌드 + Docker 이미지 → DockerHub
    → 프론트엔드 빌드 → Nginx 정적 파일 배포
    → 새 컨테이너 기동 → 헬스체크
    → Nginx upstream 전환 → 구 컨테이너 종료
```

---

## 로컬 실행

### 사전 준비

`backend/src/main/resources/application-secret.yml` 생성:

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: YOUR_GOOGLE_CLIENT_ID
            client-secret: YOUR_GOOGLE_CLIENT_SECRET
          naver:
            client-id: YOUR_NAVER_CLIENT_ID
            client-secret: YOUR_NAVER_CLIENT_SECRET
          kakao:
            client-id: YOUR_KAKAO_CLIENT_ID
            client-secret: YOUR_KAKAO_CLIENT_SECRET

jwt:
  secret-key: YOUR_JWT_SECRET

mail:
  username: resend
  password: YOUR_RESEND_API_KEY

portone:
  imp-key: YOUR_IMP_KEY
  imp-secret: YOUR_IMP_SECRET
  imp-code: YOUR_IMP_CODE
  v2-secret: YOUR_V2_SECRET
  store-id: YOUR_STORE_ID

S3_BUCKET_NAME: YOUR_S3_BUCKET
CLOUDFRONT_DOMAIN: YOUR_CLOUDFRONT_DOMAIN
AWS_REGION: ap-northeast-2
AWS_ACCESS_KEY_ID: YOUR_ACCESS_KEY
AWS_SECRET_ACCESS_KEY: YOUR_SECRET_KEY
```

### 백엔드 실행

```bash
cd backend
./gradlew bootRun
# 기본 프로필: local (localhost:8080)
```

### 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
# 기본: http://localhost:5173
```

---

## 인프라 정보

| 항목 | 값 |
|---|---|
| 서버 | AWS Lightsail (2GB RAM, 서울) |
| 고정 IP | 52.78.162.89 |
| 도메인 | reserve.it.kr (Route 53) |
| SSL | Let's Encrypt (Certbot, 자동갱신) |
| S3 버킷 | reserve-it-kr-bucket (ap-northeast-2) |
| CDN | cdn.reserve.it.kr (CloudFront) |
| 이미지 구조 | `profiles/`, `stores/thumbnails/`, `stores/images/`, `businesses/` |

---

## GitHub Secrets

| Secret | 설명 |
|---|---|
| `RESERVE_SERVER_IP` | Lightsail 고정 IP |
| `EC2_SSH_KEY` | SSH 접속 키 |
| `DOCKERHUB_USERNAME` / `DOCKERHUB_TOKEN` | DockerHub |
| `JWT_SECRET_KEY` | JWT 서명키 |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` | Naver OAuth |
| `KAKAO_CLIENT_ID` / `KAKAO_CLIENT_SECRET` | Kakao OAuth |
| `PORTONE_*` | 포트원 결제 키 |
| `RESEND_API_KEY` | Resend 이메일 API |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | S3 접근 키 |
| `S3_BUCKET_NAME` | reserve-it-kr-bucket |
| `CLOUDFRONT_DOMAIN` | cdn.reserve.it.kr |
| `VITE_API_BASE_URL` | https://reserve.it.kr |
| `DB_PASSWORD` | MySQL 비밀번호 |

---

## 서버 관리

```bash
# SSH 접속
ssh -i /path/to/reserve-server-key.pem ubuntu@52.78.162.89

# 컨테이너 상태 확인
docker ps

# 헬스체크
curl -s http://localhost:8080/actuator/health

# 로그 확인
docker logs blue --tail 50
docker logs nginxserver --tail 20

# Nginx 설정 반영
docker exec nginxserver nginx -t && docker exec nginxserver nginx -s reload

# DB 백업
docker exec mysql mysqldump -u root -p reserve > backup_$(date +%Y%m%d).sql
```
