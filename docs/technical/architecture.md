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

## 고객 웨이팅 (로컬 구현, 운영 적용 대기)

- 가게는 `OFF / ONSITE / REMOTE / BOTH`로 고객 접수를 선택해요. `/waiting`은 접수를 켠 활성 가게의 기존 카드·리스트를 재사용하고, 가게 상세에서 접수해요.
- 직원·고객 접수는 같은 명단·KST 날짜별 번호를 사용해요. 회원 → 가게 → 접수 행의 잠금으로 중복 접수·탈퇴·호출·취소·입장의 경쟁을 처리해요. 정상 진행 접수는 접수 설정을 꺼도 유지돼요.
- `/my-reservations?tab=waiting`은 본인의 대기 순서·호출·입장·취소를 보여줘요. 이름·연락처가 포함된 다른 팀의 명단은 공개하지 않아요.
- `/api/waiting/events`는 로그인 회원마다 연결해요. 커밋 후 관련 회원에게 가게 ID가 있는 갱신 신호만 전송하고, 값은 권한을 검사하는 API에서 다시 조회해요. 전체 256개·회원당 4개 연결, 2분 연결 수명·15초 heartbeat, 화면 숨김·로그아웃 시 연결 종료와 재접속·주기 조회를 적용해요.
- 응답의 `X-Accel-Buffering: no`가 Nginx API 프록시의 스트리밍 버퍼링을 해제해요. 현재 단일 앱 인스턴스를 전제로 하며 다중 인스턴스 운영 시 공유 이벤트 전달 계층이 필요해요.
- 현장 접수 QR은 15분, 고객 입장 QR은 호출 상태에서 5분 유효해요. 로그인·예약 QR과 다른 파생 키를 사용하며 접수·입장 purpose를 분리해요. 현장 링크의 토큰은 fragment에만 있어요. 링크 공유 자체로 물리적 현장 방문을 보증하지는 않아요.
- 기존 QR 스캐너가 예약·웨이팅 입장을 분기해요. 다시 스캔한 입장 QR은 멱등 처리하며 다른 가게의 직원은 처리할 수 없어요.
- 회원 탈퇴는 `MemberWithdrawn` 이벤트로 웨이팅 모듈에 전달하고 같은 트랜잭션에서 개인 연결을 제거해요. 모듈 경계 테스트의 기준선은 확장하지 않았어요. 운영 DDL은 `manual-ddl.md`의 11·12절이 필요해요.
- 공개 `/api/waiting/retention-policy`는 실제 고객 고지 시각과 접수 준비 상태만 제공해요. 고객 고지 변수는 직원 접수 변수와 별개이며, 비어 있거나 잘못된 시각이면 새 고객 접수·고객 기간 정리를 중지해요. 접수 시 제공 동의와 서버 고지 버전을 대조해 같은 접수 행에 동의한 버전을 저장해요. 고지 버전이 없는 기존 고객 자료를 기간 정리로 소급 삭제하지 않아요.

## 외부 서비스

| 서비스 | 용도 |
|---|---|
| **DockerHub** | Docker 이미지 저장소 (hanjeun/reserve) |
| **GitHub Actions** | CI/CD 파이프라인 |
| **Resend** | 이메일 발송 (reserve@reserve.it.kr) |
| **Portone V2** | 카카오페이 결제 |
| **Google/Naver/Kakao** | OAuth2 소셜 로그인 |
