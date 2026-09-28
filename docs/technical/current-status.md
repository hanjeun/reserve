# RESERVE 현재 상태

운영에 무엇이 나가 있고, 무엇이 아직 남았거나 실제 환경 확인이 필요한지 한눈에 정리해요. 이 표와 다른 문서의 "완료" 표현이 어긋나면 실제 코드와 새 실행 결과가 우선이에요.

## 운영 버전

| 항목 | 내용 |
|---|---|
| 운영 버전 | **v2.7.1** (2026-09-28) |
| 직전 버전 | v2.7.0 (2026-09-28), v2.6.3 (2026-09-26) |
| 배포 방식 | Blue/Green 무중단 배포, Nginx 한 번의 reload로 프론트·upstream 동시 전환 → [배포 운영](deployments.md) |
| 변경 내역 | [업데이트 소식](../CHANGELOG.md) · [v2.7.0 릴리스 기록](release-candidate-2026-09-27.md) |

## 운영에 반영된 것

- **계정** — refresh 회전·sliding·재사용 탐지, JSON 토큰 없이 HttpOnly 쿠키 두 개로만 반환해요.
- **캐시** — 정적 이미지·JS 캐시와 gzip 압축.
- **결제·광고** — 직접 환불 제한, 광고 전환 귀속, 문의 HTML·이메일 안전성. 광고 작성 미리보기, 노출형(카드·리스트)과 배너형 구분, 배너 제목·내용 직접 작성.
- **통합 메시지** — 고객지원·가게 문의, 차단·신고, 목록 숨김·복원, 특정 메시지 신고와 증거 열람 감사, 기한 없는 전송 취소. → [채팅 입력·관리](chat-controls.md)
- **대화 사진** — 서버 검증·AES-GCM 암호화·인증 Blob 표시. 키가 없으면 사진만 꺼져요. → [채팅 사진 키](chat-images.md)
- **탐색** — 홈 운영 안내·분야 배너, 서비스 분야 바로가기, 카드·리스트 보기, 화면별 로딩 스켈레톤.
- **API 정리** — 채팅·공지·게시글의 GET은 순수 조회, 열기·읽음·조회수는 POST로 분리했어요. 기존 `/api/chat/my*` GET은 호환용으로 남아 있어요.
- **배포 파이프라인** — 같은 입력의 테스트 증거 재사용, `stage-release` 분리, 공개 API 준비 확인 후 전환, nginx 비식별 지연 로그.

## 운영 설정 메모

| 항목 | 현재 값 |
|---|---|
| UI 언어 | 한국어만 |
| 채팅 말풍선 색 설정 | 채팅 화면에만 있어요(마이페이지에서 제거) |
| 90일 원문·사진 파기 worker | 기본 OFF. 신고 증거는 자동 파기하지 않아요 |
| FULLTEXT 검색 | off. MySQL DDL·EXPLAIN·LIKE 결과 동등성 확인 전까지 유지 |
| DB 백업 | root cron + 전용 S3. 자동 Lightsail 스냅샷은 비용 결정으로 꺼 둠 → [백업·복구](backup.md) |
| `CHAT_IMAGE_ENCRYPTION_KEY` | 비면 사진만 비활성, 잘못된 값이면 기동 실패 |

> 주의: 사진 암호화 키를 잃거나 계획 없이 바꾸면 기존 사진은 복구할 수 없어요. DB·S3 백업만으로는 되살아나지 않아요.

## 남은 일과 실제 환경 확인

"미확인"은 로컬·자동 검사만 통과했고 운영이나 실기기에서는 아직 확인하지 않았다는 뜻이에요.

| 항목 | 상태 | 참고 |
|---|---|---|
| 실제 Safari·iPhone 가상 키보드·뒤로가기 | 미확인 (Chromium 자동 검사만) | — |
| 운영 사진 왕복·타 계정 거부·키 복구 | 미확인 (로컬 송수신만 확인) | [채팅 사진 키](chat-images.md) |
| 두 실제 계정의 대화·신고·차단, 신고 증거 열람 | 미확인 | [통합 메시지](messaging.md) |
| TEST PG 결제 복귀·PAID 복구·서명 웹훅·동시 환불 단일 호출 | 운영 환경 미확인 | [결제·환불](payments.md) |
| MySQL 8 잠금·페이지네이션·거리 정렬 쿼리 | 미확인 | [품질 로드맵](quality-roadmap.md) |
| 채팅 신규 테이블·컬럼, `sender_role`의 `OWNER` 등 수동 DDL | 적용 여부는 런북의 이력으로 확인 | [수동 DDL](manual-ddl.md) |
| S3 삭제 outbox `FAILED → COMPLETED`, CDN 잔존·invalidation 정책 | 미확인 / 정책 미정 | [데이터 생명주기](data-lifecycle.md) |
| `/operation-guide`·`/content-sources` 운영 본문·sitemap | 미확인 | [지역 사진 자산](region-photo-assets.md) |
| nginx 지연 로그의 Loki 수집 | 미구현 (Promtail에 nginx job 없음). 과거 지연 원인도 미확정 | [모니터링](monitoring.md) |
| Grafana 알림 실제 수신 | 미완료 | [모니터링](monitoring.md) |
| CPU 실행/I/O 대기/steal 분리 collector·대시보드 | 운영 적용 미확인 | [모니터링](monitoring.md) |
| CSP Report-Only 7일 관측 | 미완료. 강제 CSP 전환 전 | [모니터링](monitoring.md) |
| Sonar 기존 경고 | npm lifecycle 2건(rc-tabs postinstall 유지), 디자인 스냅샷 의존성 2건 | [배포 운영](deployments.md) |

## 아직 없는 기능

- 메시지별 읽음 `1` — 별도 읽음 커서 설계가 필요해요. → [채팅 설정과 확장 판단](chat-architecture.md)
- 영구 방 나가기, 다국어
- API v1, AI 자동답변, 유료 혜택, MFA, reset-code 해시화, 광고 권리 확인·선검수 → [품질 로드맵](quality-roadmap.md)

## 지난 기록

날짜별 상태·검증 기록은 [2026-09 프리뷰 기록](history/2026-09-preview/)에 있어요. 예를 들어 [2026-09-23 상태](history/2026-09-preview/current-status-2026-09-23.md), [2026-09-27 릴리스 검사](history/2026-09-preview/release-verification-2026-09-27.md), [CI/CD 검토](history/2026-09-preview/ci-cd-review-2026-09-27.md), [공동 저자 조사](history/2026-09-preview/github-coauthor-audit-2026-09-27.md)가 있어요.
