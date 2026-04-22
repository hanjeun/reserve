# 아키텍처

---

## 인프라 구성

```
사용자
  │
  ▼
Route 53 (reserve.it.kr)
  │
  ▼
AWS Lightsail (52.78.162.89, 서울)
  │
  ├── Nginx (80/443)
  │     ├── HTTP → HTTPS 리다이렉트
  │     ├── /api/*        → Spring Boot (Blue or Green)
  │     ├── /oauth2/*     → Spring Boot
  │     └── /*            → React SPA (정적 파일)
  │
  ├── Spring Boot Blue  (8080) ─┐
  ├── Spring Boot Green (8081) ─┘ 둘 중 하나만 활성
  │
  └── MySQL 8.0 (내부 네트워크)

AWS S3 (reserve-it-kr-bucket)
  └── CloudFront (cdn.reserve.it.kr)
        └── 이미지 CDN
```

---

## AWS 서비스 구성

| 서비스 | 용도 |
|---|---|
| **Lightsail** | 애플리케이션 서버 ($10/월, 2GB RAM, 서울) |
| **Route 53** | DNS 호스팅 (reserve.it.kr) |
| **S3** | 이미지 스토리지 (reserve-it-kr-bucket) |
| **CloudFront** | 이미지 CDN (cdn.reserve.it.kr) |
| **ACM** | SSL 인증서 (CloudFront용, us-east-1) |
| **IAM** | S3 접근 제어 (reserve-s3-user) |

---

## S3 폴더 구조

```
reserve-it-kr-bucket/
├── profiles/          ← 프로필 이미지
├── stores/
│   ├── thumbnails/    ← 가게 대표 이미지
│   └── images/        ← 가게 상세 이미지
└── businesses/        ← 사업자 인증 서류
```

---

## Docker 컨테이너 구성

```
app-network (bridge)
  ├── nginxserver  → 80, 443
  ├── blue         → 8080:8080 (또는 비활성)
  ├── green        → 8081:8080 (또는 비활성)
  └── mysql        → 127.0.0.1:3306:3306
```

### Nginx 마운트
```
/home/ubuntu/nginx          → /etc/nginx/conf.d
/usr/share/nginx/html       → /usr/share/nginx/html (React SPA)
/etc/letsencrypt            → /etc/letsencrypt:ro (SSL 인증서)
```

---

## Blue/Green 배포 흐름

```
1. main 브랜치 push

2. GitHub Actions 시작
   ├── build-backend
   │     └── Gradle 빌드 → Docker 이미지 → DockerHub push
   ├── build-frontend
   │     └── npm build → SCP로 서버 전송 → Nginx 정적 파일 갱신
   └── deploy-backend
         ├── 현재 활성 컨테이너 확인 (Blue or Green)
         ├── 반대 컨테이너 새로 기동
         ├── SSH 내부 헬스체크 (localhost:port/actuator/health)
         ├── Nginx upstream 전환 (service-env.inc 수정 후 reload)
         └── 구 컨테이너 종료
```

---

## SSL 인증서

- **방식**: Let's Encrypt (Certbot)
- **위치**: `/etc/letsencrypt/live/reserve.it.kr/`
- **자동갱신**: certbot.timer (systemd, 하루 2번 체크)
- **Nginx reload 훅**: `/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`

---

## 외부 서비스

| 서비스 | 용도 |
|---|---|
| **DockerHub** | Docker 이미지 저장소 (hanjeun/reserve) |
| **GitHub Actions** | CI/CD 파이프라인 |
| **Resend** | 이메일 발송 (reserve@reserve.it.kr) |
| **ImprovMX** | 이메일 수신 포워딩 (→ hanjeun111@gmail.com) |
| **Portone V2** | 카카오페이 결제 |
| **Google/Naver/Kakao** | OAuth2 소셜 로그인 |
