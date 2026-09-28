# 아키텍처

---

## 인프라 구성

![RESERVE 아키텍처](../images/RESERVE_Architecture.png)

---

## AWS 서비스 구성

| 서비스 | 용도 | 세부 |
|---|---|---|
| **Lightsail** | 애플리케이션 서버 | `small_3_0` — $12/월(부가세 별도), 2 vCPU · 2GB RAM · 60GB SSD · 전송 3TB/월, 서울(ap-northeast-2). 2026-09-25 `get-bundles` 조회 |
| **Route 53** | DNS 호스팅 | reserve.it.kr 호스팅 영역 |
| **S3** | 이미지 스토리지 | reserve-it-kr-bucket, 서울 |
| **S3** | DB 백업 | reserve-it-kr-backup, 서울 — 비공개·기본 암호화·버전 관리, 90일 보관(`backup.md`) |
| **CloudFront** | 이미지 CDN | cdn.reserve.it.kr (E1VOAW2W8K0VA4) |
| **ACM** | SSL 인증서 | CloudFront용, us-east-1 리전 필수 |
| **IAM** | S3 접근 제어 | `reserve-s3-user`: 이미지 버킷 올리기·보기·지우기만(인라인 `reserve-app-images-rw`) · `reserve-backup-uploader`: 백업 버킷 `mysql/` 올리기만 — 2026-09-25 |
| **Budgets** | 요금 알림 | `reserve-monthly` 월 $20 — 실제 80%·예상 100% 초과 시 운영 Gmail로 메일 |

> **계정 운영(2026-09-25 결정):** root는 MFA가 켜져 있고 액세스 키가 없다. 혼자 쓰는 계정이라 관리용 IAM 사용자는
> 두지 않고 root로 로그인하되, 작업이 끝나면 로그아웃하고 root 키는 만들지 않는다. 요금 알림을 이상 사용의 보완 신호로 둔다.
> 가입 이메일과 대체 연락처(결제·운영·보안)는 운영 Gmail(푸터·개인정보처리방침과 같은 주소)이다.

> 위 IAM 값은 9/25 Claude 세션·원격 dev 증거다. 이번 대화에서 AWS 정책을 변경하거나 다시 조회한 것은 아니다.
> 새 채팅 사진은 기존 이미지 버킷/권한을 재사용하며 FullAccess나 새 버킷을 추가하지 않는다.

---

## S3 폴더 구조

사용자 파일은 `users/{memberId}/`, 공지 파일은 `notices/`, 고객지원 사진은 `system/chat/support/` 아래다.
대화 사진은 `users/{senderId}/chat/{roomId}/*.bin` 암호문이며 공개 CDN 원본 이미지로 표시하지 않는다.
모든 경로는 `file/util/FileStoragePaths.java`와 환경 prefix 관문을 따른다.

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

> 로컬 개발 환경에서는 맨 앞에 `local/` 접두가 하나 더 붙는다(운영 객체와 섞이지 않도록).
> 예: `local/users/1/profiles/xxx.jpg` — `FileStorageService`의 env-prefix 참고.

### 이미지 업로드 관문

브라우저의 파일명·확장자·`Content-Type`은 신뢰하지 않는다. 모든 S3 업로드는
`ImageFileValidator`에서 실제 바이트 형식, 선언 MIME, 확장자, 크기, 해상도를 먼저 대조한다.

- 허용: JPEG, PNG, GIF, WebP
- 파일당 최대 8MB, 한 변 최대 8192px, 전체 최대 2천만 픽셀
- JPEG/PNG/GIF는 ImageIO 전체 디코딩까지 성공해야 한다.
- JDK 기본 코덱이 없는 WebP는 RIFF 전체 chunk 경계, 캔버스 헤더와 실제 VP8/VP8L 프레임
  (애니메이션은 ANMF 내부 프레임) 존재·크기를 구조적으로 검증한다.
- canonical MIME과 확장자로 S3 key/metadata를 만든다. 클라이언트가 보낸 값은 그대로 저장하지 않는다.
- 프론트의 accept/크기 검사는 빠른 UX일 뿐이며 서버 검사가 최종 관문이다.
- 가게·광고의 한 요청에 추가하는 새 이미지 전체 합계도 8MB로 제한해 2GB 서버의 순간 메모리를 보호한다.

AVIF는 현재 서버가 완전 디코딩할 수 없어 허용 목록에서 제외했다. 코덱을 추가하기 전 확장자만 먼저
허용하지 않는다.

---

## Docker 컨테이너 구성

```
app-network (bridge)
  ├── nginxserver  → 80, 443
  ├── blue         → 8080:8080 (또는 비활성)
  ├── green        → 8081:8081 (또는 비활성)
  └── mysql        → 127.0.0.1:3306:3306
```

## 비용 효율 원칙 (2026-09-11)

현재 트래픽과 1인 운영에서는 관리형 서비스를 늘리는 것보다 경계를 단순하게 유지하는 편이 싸고 복구도 쉽다.

| 데이터/일 | 현재 선택 | 이유 |
|---|---|---|
| 가게 폼 초안 | 브라우저 IndexedDB | 입력마다 API·MySQL·S3 write가 0. 최종 제출만 서버에 전송 |
| 거래·회원·예약 | 단일 MySQL | FK·트랜잭션·잠금이 필요한 정본. 브라우저 저장으로 대체하면 안 됨 |
| 이미지 | S3 + CloudFront | 앱 디스크와 DB blob을 피하고 전송을 CDN에 위임 |
| 외부 작업 재시도 | MySQL outbox + 소량 scheduler | 현재 규모에서 Redis/SQS/Kafka 운영비와 장애면을 추가하지 않음 |
| 로그·자원 | 기존 collect-metrics.sh/Promtail/Loki/Grafana | Prometheus 상주 메모리 없이 기존 로그 경로를 재사용하고 새 관측 스택을 중복 도입하지 않음 |
| 배포 | Lightsail Blue/Green | 짧게 두 앱을 함께 띄워 롤백 가능. 각 JVM heap 상한 512MB 유지 |

Redis, Kafka, Kubernetes, 별도 검색 클러스터, RDS 전환은 이름값으로 도입하지 않는다. 다음 중 실제 증거가
생길 때만 검토한다: DB CPU/IO·커넥션 포화, scheduler 지연, 여러 앱 인스턴스의 작업 경합, 백업/복구 목표를
Lightsail이 충족하지 못함, 운영자가 감당할 수 없는 장애 복구 시간. 먼저 느린 쿼리·인덱스·캐시 헤더·배치
크기와 이미지 크기를 고치는 것이 비용 대비 효과가 크다.

가게 초안의 상세 계약은 [가게 임시저장](store-drafts.md), 계정 outbox는
[계정 보안](account-security.md)을 따른다.

## 백업 구조 (기존 운영 적용·새 자원 추가 없음)

9/25 증거: 별도 비공개 S3/versioning/90일 Standard 보관, put-only writer, 서버 스크립트와 매일 03:10 KST cron,
26/26 테이블 격리 복원·행 수 일치. 9/26에는 28테이블 백업 업로드를 확인했다. 자동 Lightsail 스냅샷은 끈 상태를 유지한다.
실패 알림의 실제 발화·수신과 이번 후보의 복원/rollback은 별도 관문이다. 운영 실시간 재확인은 이번에 하지 않았다.
설치 명령을 다시 실행하거나 새 자원을 만들지 않고 [백업·복구 런북](backup.md)을 따른다.

### Nginx 마운트
```
/home/ubuntu/nginx          → /etc/nginx/conf.d
/usr/share/nginx/html       → /usr/share/nginx/html (React SPA release root)
  ├── current              → releases/<commit-sha> (운영 도구용 현재 포인터)
  └── releases/            → 현재 + 직전 2개 프론트 빌드
/etc/letsencrypt            → /etc/letsencrypt:ro (SSL 인증서)
```

v2.6 후보 배포에서 실제 Nginx `root`는 전환 시 선택한 `releases/<commit-sha>` 절대 경로다.
`current`만 바꾸면 설정된 root·backend upstream은 되돌아가지 않으므로 완전한 rollback이 아니다.

---

## Blue/Green 배포 흐름

아래는 현재 로컬 동시 컷오버 후보이며 production v2.6.3에서 이 변경을 실증한 것은 아니다.

```
1. main 브랜치 push

2. GitHub Actions 시작
   ├── build-backend
   │     └── Gradle 빌드 → Docker 이미지 → DockerHub push
   ├── build-frontend (needs: build-backend)
   │     └── 단위·브라우저 테스트 → npm build → SCP → releases/<SHA>와 SHA별 Nginx 템플릿 staging
   └── deploy-backend (needs: build-frontend)
         ├── 현재 활성 컨테이너 확인 (Blue or Green)
         ├── 반대 컨테이너 새로 기동
         ├── SSH 내부 헬스체크 (localhost:port/actuator/health)
         ├── 새 프론트 절대 root + 새 upstream 후보를 함께 검사
         ├── 한 번의 Nginx reload로 전환
         ├── Nginx 경유 HTML·asset·공개 API smoke
         └── 성공 뒤 구 컨테이너 종료; 실패 시 root·upstream 함께 rollback
```

---

## Git 브랜치 전략

```
main          ← 배포 브랜치 (CI/CD 트리거)
  ↑
dev           ← 개발 통합 브랜치 (기본 브랜치)
  ↑
feature/*     ← 기능별 작업
```

- `feature/*` 완료 → `dev` PR 머지 (배포 없음)
- `dev` 안정화 → `main` PR 머지 → CI/CD 자동 실행
- 긴급 수정: `hotfix/*` → `main` 직접 PR

---

## SSL 인증서

- **방식**: Let's Encrypt (Certbot **standalone**)
- **위치**: `/etc/letsencrypt/live/reserve.it.kr/` (reserve.it.kr · www · grafana)
- **자동갱신**: certbot.timer (systemd, 하루 2번 체크)
- **갱신 훅**: `/etc/letsencrypt/renewal-hooks/pre/stop-nginx.sh` → `docker stop nginxserver`
  `/etc/letsencrypt/renewal-hooks/post/start-nginx.sh` → `docker start nginxserver`

> ⚠️ **`deploy/reload-nginx.sh` 방식으로 되돌리지 말 것. 2026-07-21 에 인증서가 실제로 만료됐다.**
>
> nginx 는 호스트 systemd 서비스가 아니라 **`nginxserver` 라는 도커 컨테이너**이고 80/443 을 점유한다.
> 그래서 `standalone` 갱신이 80 을 못 잡아 조용히 실패했고(`webroot` 도 SPA 가 챌린지 경로를 가로채 실패),
> 자동갱신이 몇 달간 실패하는 동안 아무도 몰랐다. `systemctl stop/reload nginx` 는 "Unit not found" 로 끝난다.
>
> 지금 구조는 갱신 때마다 컨테이너를 잠깐 내렸다 올린다 — **다운타임 약 30초, 60일에 한 번.**
> 확인은 `sudo certbot renew --dry-run` (pre 훅이 nginxserver 를 멈추고 post 훅이 되살리면 정상).
> DNS-01/Route53 으로 무중단 갱신하는 길이 있지만 IAM 설정이 필요해 보류 중이다.

---

## 외부 서비스

| 서비스 | 용도 |
|---|---|
| **DockerHub** | Docker 이미지 저장소 (hanjeun/reserve) |
| **GitHub Actions** | CI/CD 파이프라인 |
| **Resend** | 이메일 발송 (reserve@reserve.it.kr) |
| **Portone V2** | 카카오페이 결제 |
| **Google/Naver/Kakao** | OAuth2 소셜 로그인 |
