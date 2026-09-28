# v2.7.0 릴리스 기록

2026-09-27에 통합 후보로 준비해 2026-09-28 v2.7.0과 후속 v2.7.1로 배포한 릴리스의 내용과 남은 후속 작업이에요. 사용자 관점 변경은 [업데이트 소식](../CHANGELOG.md), 운영 상태는 [현재 상태](current-status.md)를 봐요.

## 담긴 변경

| 묶음 | 내용 |
|---|---|
| 계정 | 운영 refresh 회전·sliding·재사용 폐기와 두 쿠키 계약을 그대로 유지 |
| 고객지원 사진 | 경로를 `system/chat/support`로 통일해 삭제 관문과 맞춤 |
| 대화 사진 | 실제 이미지 검증·암호화·소유권·차단·재시도, 인증 Blob 표시, 신고 범위 관리자 열람 |
| GET 쓰기 분리 | 채팅·공지·게시글 조회에서 방 생성·읽음·조회수 쓰기를 빼고 POST로 옮김 |
| 목록 로딩 | 실제 목록과 같은 폭·개수·그리드의 스켈레톤, 저장된 카드/리스트 보기 |
| 배포·관측 | 선택적 secret 전달, 배포 후 스키마 검사 복원·선택 검사, CPU 지표 의미 분리, 캐시 후보, 옛 해시 자산 보존(`preserve-frontend-assets.sh`) |

## 공용 인터페이스 변경

| 인터페이스 | 계약 |
|---|---|
| POST `/api/auth/refresh` | `ApiResponse<Void>` + HttpOnly access/refresh 쿠키. JSON 토큰 없음 |
| GET `/api/chat/images/config` | 인증 필요, `enabled`/`maxBytes`. 키가 없으면 사진만 false |
| POST `/api/chat/rooms/{roomId}/images` | 참가자·지원 관리자, multipart image + 선택 content + 필수 clientMessageId, 한 장 8MiB |
| GET `/api/chat/images/{messageId}` | 참가자(지원 관리자는 지원방), 실제 MIME·no-store·nosniff. S3 key·공개 URL 미반환 |
| GET `/api/admin/chat/reports/{reportId}/images/{messageId}` | ADMIN, 해당 신고 문맥의 메시지만 |
| POST `/api/chat/support/open`, `/stores/{storeId}/open`, `/store-inbox/{roomId}/open` | 대화 열기·읽음 처리를 명시적 쓰기로 분리 |
| POST `/api/admin/chat/rooms/{roomId}/open` | ADMIN 고객지원 방 열기·읽음 |
| 대응 GET 채팅 조회 | 생성·읽음 변경 없음, 없는 방은 404. 레거시 `/api/chat/my*`는 호환 유지 |
| POST `/api/notices/{id}/view` | 공개, IP 제한, 없는 ID는 no-op |
| POST `/api/community/posts/{postId}/view` | 기존 community 인증 경계, IP 제한 |
| 광고 impression/click | 공개 PATCH, 유효 광고만 집계, 무효·제한은 200 no-op |
| 광고 conversion | 인증 PATCH, 예약 소유권·같은 가게·24시간·허용 상태 원자 검사 |
| GET `/api/advertisements/my` | Page 응답, 기본 20·최대 100 |

공지·게시글 상세 GET은 조회수를 올리지 않아요. 새 소비자는 상세 조회 뒤 POST view를 따로 호출해야 해요.

## DB·환경 변수

- `chat_message` 사진 컬럼 `image_key`, `image_content_type`, `image_width`, `image_height`, `image_bytes`는 모두 nullable이에요.
- 새 테이블 `chat_report`, `chat_intro`, `chat_intro_item`과 새 컬럼·인덱스는 [수동 DDL](manual-ddl.md)에서 대조해요.
- `chat_message.sender_role`은 `OWNER`를 저장할 수 있어야 해요. 기존 ENUM에 없으면 수동 DDL이 필요해요.
- `RESERVE_VERIFY_PREVIEW_SCHEMA=1`일 때만 읽기 전용 스키마 검사가 새 테이블·사진 컬럼까지 요구해요.
- 새 선택적 secret `CHAT_IMAGE_ENCRYPTION_KEY`(표준 Base64 32바이트). 생성·등록·복구는 [채팅 사진 키](chat-images.md)를 따라요.
- 사진 객체는 기존 이미지 버킷 `users/{senderId}/chat/{roomId}/*.bin`(환경 prefix 포함)에 저장해요. 새 AWS 자원·IAM은 없어요.

> 주의: 키 ID·다중 키 복호화는 아직 없어요. OAuth/JWT 키를 재사용하거나 기존 사진 키를 계획 없이 바꾸지 않아요.

## 남은 후속 작업

- 실제 Safari·두 실계정 최종 확인
- MySQL 8 잠금·페이지·거리 쿼리, TEST PG 복귀·PAID 복구·서명 웹훅·동시 환불 단일 호출
- 실제 S3 사진 왕복·타 계정 403·차단·신고 범위, 키 복구와 사진 보존·삭제 정책, outbox `FAILED → COMPLETED`
- `/operation-guide`·`/content-sources` 운영 본문과 sitemap 확인
- Grafana 실패 알림 실제 수신, CPU collector → 대시보드, CSP Report-Only 7일 관측
- CDN 캐시 TTL 후보(공용 이미지 1일, 해시 없는 폰트·이미지 7일, 해시 `/assets/` 1년 immutable)와 invalidation 정책 검증

자세한 검사 기록은 [릴리스 검사 기록](history/2026-09-preview/release-verification-2026-09-27.md)과 [공동 저자 조사](history/2026-09-preview/github-coauthor-audit-2026-09-27.md)에 있어요.
