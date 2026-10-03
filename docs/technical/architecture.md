# 아키텍처

RESERVE의 인프라 구성, 저장소 경로, 배포 흐름을 정리했어요.

## 인프라 구성

![RESERVE 아키텍처](../images/RESERVE_Architecture.png)

## AWS 서비스

| 서비스 | 용도 | 세부 |
|---|---|---|
| **Lightsail** | 애플리케이션 서버 | `small_3_0` — 2 vCPU · 2GB RAM · 60GB SSD, 서울(ap-northeast-2) |
| **Route 53** | DNS 호스팅 | reserve.it.kr 호스팅 영역 |
| **S3** | 이미지 스토리지 | reserve-it-kr-bucket, 서울 |
| **S3** | DB 백업 | reserve-it-kr-backup, 서울 — 비공개·기본 암호화·버전 관리, 90일 보관 |
| **CloudFront** | 이미지 CDN | cdn.reserve.it.kr |
| **ACM** | SSL 인증서 | CloudFront용, us-east-1 리전 |
| **IAM** | S3 접근 제어 | `reserve-s3-user`: 이미지 버킷 올리기·보기·지우기 · `reserve-backup-uploader`: 백업 버킷 `mysql/` 올리기 |
| **Budgets** | 요금 알림 | 월 예산 초과(실제 80%·예상 100%) 시 메일 |

채팅 사진도 이미지 버킷과 같은 권한을 써요.

## S3 폴더 구조

사용자 파일은 `users/{memberId}/`, 공지 파일은 `notices/`, 고객지원 사진은 `system/chat/support/` 아래예요.
대화 사진은 `users/{senderId}/chat/{roomId}/*.bin` 암호문이라 CDN으로 공개하지 않아요.
모든 경로는 `file/util/FileStoragePaths.java`와 환경 prefix를 따라요.

```
reserve-it-kr-bucket/
└── users/{memberId}/
    ├── profiles/                              ← 프로필 이미지
    ├── businesses/                            ← 사업자 인증 서류 (pre-signed URL로만 조회)
    └── stores/{storeId}/
        ├── thumbnails/                        ← 가게 대표 이미지
        ├── images/                            ← 가게 상세 이미지
        └── advertisements/                    ← 광고 배너 이미지
```

로컬 개발 환경은 경로 앞에 `local/`이 붙어요(예: `local/users/1/profiles/xxx.jpg`).

### 이미지 업로드 검사

모든 S3 업로드는 `ImageFileValidator`가 실제 바이트 형식, 선언 MIME, 확장자, 크기, 해상도를 대조해요.

| 항목 | 규칙 |
|---|---|
| 허용 형식 | JPEG, PNG, GIF, WebP |
| 크기 | 파일당 최대 8MB, 가게·광고 한 요청의 새 이미지 합계도 8MB |
| 해상도 | 한 변 최대 8192px, 전체 최대 2천만 픽셀 |

- JPEG/PNG/GIF는 ImageIO로 전체 디코딩해요.
- WebP는 RIFF chunk 경계, 캔버스 헤더, 실제 VP8/VP8L 프레임(애니메이션은 ANMF 내부 프레임)을 검사해요.
- S3 key와 metadata는 서버가 정한 MIME과 확장자로 만들어요.
- 프론트의 형식·크기 검사는 입력 편의용이고, 최종 판단은 서버가 해요.

## Docker 컨테이너

```
app-network (bridge)
  ├── nginxserver  → 80, 443
  ├── blue         → 8080:8080 (또는 비활성)
  ├── green        → 8081:8081 (또는 비활성)
  └── mysql        → 127.0.0.1:3306:3306
```

### Nginx 마운트

```
/home/ubuntu/nginx          → /etc/nginx/conf.d
/usr/share/nginx/html       → /usr/share/nginx/html (React SPA release root)
  ├── current              → releases/<commit-sha> (운영 도구용 현재 포인터)
  └── releases/            → 현재 + 직전 2개 프론트 빌드
/etc/letsencrypt            → /etc/letsencrypt:ro (SSL 인증서)
```

Nginx `root`는 전환 때 고른 `releases/<commit-sha>` 절대 경로예요. 전환 절차는 [배포 운영](deployments.md)을 봐요.

## 데이터 저장 위치

| 데이터/일 | 저장 위치 |
|---|---|
| 가게 폼 초안 | 브라우저 IndexedDB, 최종 제출만 서버로 → [가게 임시저장](store-drafts.md) |
| 거래·회원·예약 | 단일 MySQL |
| 이미지 | S3 + CloudFront |
| 외부 작업 재시도 | MySQL outbox + scheduler → [계정 보안](account-security.md) |
| 로그·자원 지표 | collect-metrics.sh / Alloy / Loki / Grafana |
| 배포 | Lightsail Blue/Green, JVM heap 상한 512MB |

## 백업

- 비공개 S3 버킷(버전 관리, 90일 보관)에 올리기 전용 계정으로 올려요.
- 서버 스크립트가 매일 03:10 KST cron으로 돌아요.
- 절차는 [백업·복구 런북](backup.md)을 따라요.

## Blue/Green 배포 흐름

```
1. main 브랜치 push

2. GitHub Actions 시작
   ├── test-backend / test-frontend
   │     └── 백엔드 unit·H2, 프론트 lint·단위·브라우저 테스트
   ├── build-backend (needs: test-backend)
   │     └── Gradle 빌드 → Docker 이미지 → DockerHub push
   ├── build-frontend (needs: build-backend, test-frontend)
   │     └── npm build → dist 아티팩트
   ├── stage-release (needs: build-backend, build-frontend)
   │     └── SCP → releases/<SHA>와 SHA별 Nginx 템플릿 staging (live 변경 없음)
   └── deploy-backend (needs: 위 전부)
         ├── 현재 활성 컨테이너 확인 (Blue or Green)
         ├── 반대 컨테이너 새로 기동
         ├── SSH 내부 헬스체크 (localhost:port/actuator/health)
         ├── 새 프론트 절대 root + 새 upstream 후보를 함께 검사
         ├── 한 번의 Nginx reload로 전환
         ├── Nginx 경유 HTML·asset·공개 API smoke
         └── 성공 뒤 구 컨테이너 종료; 실패 시 root·upstream 함께 rollback
```

## Git 브랜치

```
main          ← 배포 브랜치 (CI/CD 트리거)
  ↑
dev           ← 개발 통합 브랜치 (기본 브랜치)
  ↑
feature/*     ← 기능별 작업
```

- `feature/*` 완료 → `dev` PR 머지 (배포 없음)
- `dev` → `main` PR 머지 → CI/CD 자동 실행
- 긴급 수정: `hotfix/*` → `main` 직접 PR

자세한 규칙은 [Git 워크플로우](../rules/git-workflow.md)를 봐요.

## SSL 인증서

| 항목 | 값 |
|---|---|
| 방식 | Let's Encrypt (Certbot **standalone**) |
| 위치 | `/etc/letsencrypt/live/reserve.it.kr/` (reserve.it.kr · www · grafana) |
| 자동 갱신 | certbot.timer (systemd, 하루 2번 체크) |
| 갱신 훅 | `/etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh` → `docker stop nginxserver`<br>`/etc/letsencrypt/renewal-hooks/post/start-nginx.sh` → `docker start nginxserver` |

nginx는 80/443을 쓰는 `nginxserver` 도커 컨테이너라, 갱신 때 컨테이너를 잠깐 내렸다 올려요. 갱신 확인은 `sudo certbot renew --dry-run`으로 해요.

## 외부 서비스

| 서비스 | 용도 |
|---|---|
| **DockerHub** | Docker 이미지 저장소 (hanjeun/reserve) |
| **GitHub Actions** | CI/CD 파이프라인 |
| **Resend** | 이메일 발송 (reserve@reserve.it.kr) |
| **Portone V2** | 카카오페이 결제 |
| **Google/Naver/Kakao** | OAuth2 소셜 로그인 |
