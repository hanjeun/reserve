# 품질 로드맵

아직 검증되지 않은 위험과 다음에 할 일을 우선순위대로 모았어요. 기능별 운영 반영 여부는 [현재 상태](current-status.md)를 봐요.

## 원칙

- 로컬·H2·mock 통과를 운영 검증으로 옮겨 적지 않아요. MySQL·PG·S3·실기기는 따로 확인해요.
- 반복 수정 중에는 변경별 표적 검사만 돌리고, 전체 CI·빌드·브라우저 검사는 확정 후보에서 한 번 돌려요.
- PG·운영 DB·S3에 쓰는 작업과 LIVE 결제는 건별 승인 없이 하지 않아요.
- 검사가 실패하면 테스트를 완화하지 않고 릴리스를 보류해요.

## P0 — 금융·데이터

| 할 일 | 완료 기준 |
|---|---|
| TEST PG 시나리오 | 결제 복귀, PAID 복구, 서명 웹훅, 동시 환불의 단일 PG 호출, 응답 유실, PG 성공 뒤 DB 반영 실패 |
| MySQL 8 실측 | 금융 잠금·lease 인계, 폐업·제재 경합, 커밋된 201건 이상 검색·count·특수문자, 거리순 쿼리 계획 |
| FULLTEXT 켜기 | MySQL DDL·EXPLAIN·LIKE 결과 동등성 확인 뒤에만 flag on → [수동 DDL](manual-ddl.md) |
| 사진 키·S3 | 키 보관·복구 확인, 실제 S3 사진 왕복·타 계정 403·차단·신고 범위, 삭제 outbox `FAILED → COMPLETED` → [채팅 사진 키](chat-images.md) |
| 광고 과거 주문 대사 | 과거 코드가 덮어쓴 주문번호를 PG 거래 이력과 대조 → [광고 결제](ad-payments.md) |

광고 금융에서 남은 주의점이에요.

- 환불 발신 전 커밋 뒤 프로세스가 죽으면 HTTP가 안 나갔을 수 있어요. 맹목 재시도하지 않고 수동 복구해요.
- 오래된 READY/NOT_FOUND, 부분 취소, 과거 REFUNDED 모순은 임의로 종결하지 않아요. 운영자 증거와 건별 승인이 필요해요.
- 새 상태·테이블이 쓰인 뒤에는 구버전 백엔드로 무조건 롤백하지 않아요. [스키마 확인](manual-ddl.md)과 [광고 복구 런북](ad-payments.md)을 먼저 따라요.
- 결제된 `ACTIVE` 광고도 사업자가 문구를 고칠 수 있고, 관리자가 사후 `SUSPENDED` 처리하는 정책이에요.

## P1 — 운영 관측

- Grafana 알림 실제 수신 확인(백업 부재·OAuth·S3 실패 문구 포함) → [모니터링](monitoring.md)
- nginx 로그 → Promtail → Loki 수집 연결, 그 뒤 결제·지도·Sentry를 포함한 CSP Report-Only 7일 관측
- CPU collector 먼저 적용 → 새 CPU 시계열 확인 → 대시보드 반영
- CDN 삭제 잔존과 invalidation 정책 결정. S3 삭제와 CDN 제거는 별개예요.
- 실제 배포 중 옛 lazy chunk·폰트 요청이 보존된 해시 자산으로 처리되는지 확인 → [배포 운영](deployments.md)

## P1 — 실기기·실계정

- 실제 Safari 뒤로가기와 iPhone 가상 키보드, 320/375/768/1440 화면
- 실제 계정의 로그아웃·다른 탭 session fencing, 쿠키 만료·소셜 로그인 조합
- 두 계정의 가게 채팅·신고·차단 → [통합 메시지](messaging.md)

## P2 — 코드 품질

| 할 일 | 완료 기준 |
|---|---|
| 남은 빈 catch·사업자 가게 필터 오류 | 통신 실패와 빈 목록 구분, 재시도 제공. 조용한 폴링 일시 실패와는 구분 |
| 이미지 열기·닫기·뒤로가기 일반 모션 | PC·390px 실제 DOM·프레임 검사. reduced-motion smoke로 대체하지 않음 |
| 큰 JS 청크·거리 검색 비용 | import graph·실기 성능·쿼리 계획 측정 후 변경 |
| 모듈 경계 정리 | [모듈러 모놀리스 전환 계획](modularization-plan.md) 1단계부터 |

## P2 — 의존성·저장소

- 의존성 PR은 제품 통합과 분리해 최신 `dev`에서 다시 검증해요.
- AntD/rc-tabs가 올라가면 모바일 탭 패치를 실제 DOM 기준으로 다시 만들어요. `--ignore-scripts`, `--force`, `--legacy-peer-deps`로 우회하지 않아요.
- PR 상태는 아래 도구로 조회해요. 머지·재실행·라벨 변경은 하지 않아요.

```bash
node scripts/pr-review-audit.mjs
node scripts/pr-review-audit.mjs --json
```

> 주의: 필수 검사가 없거나 skip/neutral이면 준비 완료로 보지 않아요.

GitHub 설정 검토 거리예요(적용은 승인 후). Dependabot이 붙이는 `chore`/`dependencies` 라벨 정합성, 필수 검사의 strict 여부, main 관리자 예외. 머지 방식은 [Git 워크플로우](../rules/git-workflow.md)를 따라요.

## 이후 — 별도 제품 범위

- [API 버전 관리](api-versioning.md): v1은 호환성 계약과 폐기 일정을 정한 뒤 시작해요.
- 광고 지표: 지금 노출 수는 참고용이고 과금 증거가 아니에요. 공정 회전과 50%/1초 viewability는 별도 설계예요.
- 메시지별 읽음 `1`, AI 자동답변, 유료 혜택, MFA, reset-code 해시화, 광고 권리 확인·선검수.

### 공개 사이트·앱 분리 (제안)

`reserve.it.kr`은 공개 설명·검색 유입·탐색에, `app.reserve.it.kr`은 로그인·예약·결제·사업자·관리자 작업에 쓰는 방향이에요. OAuth 콜백, CORS, canonical/OG/sitemap, 인증서, CSP가 모두 현재 호스트에 묶여 있어서 호스트부터 나누지 않아요.

1. URL 소유권 표와 전환·롤백 계획을 먼저 확정해요.
2. 자유 문자열 `category`와 별도로 정규화된 서비스 도메인을 두고, `SLOT`/`SESSION`/`DAY` 예약 방식과 섞지 않아요.
3. 오프라인 대기(번호표·호출·만료)는 시간 예약 상태가 아니라 별도 기능으로 설계해요.
4. 홈 상단 광고 상품은 노출 위치·일정·공지/유료 구분·집계를 먼저 모델링해요.
5. canonical은 한 호스트에만 두고, 중복 색인은 redirect/canonical로 막아요.
6. 마지막에 DNS·TLS·NGINX·OAuth 콜백·쿠키/CORS·CSP·모니터링·배포를 함께 전환해요.

## 지난 기록

과거 검사 수치와 점검 내역은 [2026-09 프리뷰 기록](history/2026-09-preview/)에 있어요. 예를 들어 [안정화 체크포인트](history/2026-09-preview/stabilization-progress-2026-09-14.md), [큰 단계 진행 현황](history/2026-09-preview/roadmap-progress-2026-09-13.md), [2026-09-09 로드맵](history/2026-09-preview/quality-roadmap-dev-2026-09-09.md)이 있어요.
