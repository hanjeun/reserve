# 채팅 입력·설정·전송 취소

일반 글·사진은 전송일부터 90일, 처리된 일반 신고·증거는 처리 완료일부터 1년 보존해요.
소비자 불만·거래 분쟁 기록은 처리 완료일부터 3년, 계약·결제·공급 증거는 실제 거래일을 기준으로 5년 보존해요.
미처리·미분류 신고와 진행 중인 분쟁은 파기를 보류해요. 실제 고지 게시일부터 30일 유예 후 기존 자료에도 적용해요.
고지 시각이 없거나 미래·잘못된 값이면 파기하지 않아요. DDL 적용과 배포·설정 등록은 구분하며 운영 적용 이력은 [수동 DDL](manual-ddl.md)에 남겨요.

채팅 입력창, 전송 취소, 목록 숨김, 신고 증거, 90일 보존 규칙을 정리해요.

## 입력과 전송

- 고객·사업자·관리자가 같은 입력창을 써요. 도구는 사진 첨부와 검색 가능한 이모지예요. 사진은 [채팅 사진 키](chat-images.md)가 설정된 환경에서만 보여요.
- Enter는 전송, Shift+Enter는 줄바꿈이고, 한글 조합 중에는 전송하지 않아요.
- 전송 중 정지 버튼은 브라우저 요청만 중단해요. 재시도는 같은 `clientMessageId`로 중복 저장을 막아요.
- 전송 전 사진 썸네일은 `useImagePreview`를 써요.
- 사진 원본 바이트와 투명도는 재인코딩하지 않고 암호화해 저장해요. 썸네일은 회색 덮개 없이 원래 비율로 보여요.
- 새 사진은 원래 파일명으로 다운로드해요. 경로·제어문자·금지 문자는 제거하고 실제 파일 형식에 맞는 확장자를 유지해요. 이전 사진의 저장하지 않은 파일명은 복원하지 않아요.

## 전송 취소

- 내가 보낸 메시지는 관리 메뉴에서 시간 제한 없이 취소할 수 있어요. 방 접근권과 실제 발신자 ID가 모두 맞아야 해요.
- 응답에는 발신자 ID 대신 `canRetract`만 내려가요.
- 취소된 메시지는 양쪽 화면에 `전송이 취소된 메시지입니다.`로 보이고, 일반 사진 조회는 404예요.
- 원문·사진은 지우지 않고 신고 검토용으로 보존해요. 권한 있는 신고 문맥에서만 볼 수 있어요.
- 취소는 `retractionRevision`으로 폴링해 반영해요. 메시지 순서와 읽지 않은 수는 바뀌지 않아요.
- PC에서는 내 말풍선 왼쪽 메뉴가 hover·포커스 때 보이고, 터치에서는 44px 버튼이 항상 보여요.

## 설정과 화면

- 말풍선 색은 메신저 설정에만 있고 기기별로 저장돼요.
- 앱 전체 모양·글꼴·포인트 색은 마이페이지에서 바꿔요.
- 배경은 paper 토큰을 따르고, 하단 내비게이션은 반투명이에요.
- 들어가기/뒤로가기 전환은 같은 260ms 곡선을 반대 방향으로 써요.
- 읽지 않은 숫자는 실행 버튼·목록·하단 메뉴 모두 밝은 오류 색(`--c-error`)을 써요.

## 닫기와 새로고침

- 모바일 홈·대화 목록·설정·대화 안에 44×44px X가 있어요. X는 `/messages`를 닫고 이전 화면(직접 진입이면 홈)으로 돌아가요. 대화 안의 ←는 목록으로 돌아가요.
- 메신저 목록과 공통 `RefreshButton`은 `useRefreshCooldown`의 3초 쿨다운을 같이 써요. 요청 중에만 `SyncOutlined`가 회전해요.

## 목록 숨김

- 숨김은 MEMBER/OWNER 역할별로 본인 목록만 가려요. 상대 화면·신고·참가 권한은 그대로이고 차단도 아니에요.
- `숨긴 대화 보기`에서 복원하거나 신고할 수 있어요. 새 메시지가 오면 다시 목록에 보여요.
- 가게 소유자가 바뀌면 이전 소유자의 숨김은 이어지지 않아요. 관리자 고객지원 받은편지함은 숨길 수 없어요.

## 신고 증거

- 가게 대화 참가자는 취소된 상대 메시지도 `messageId`로 신고할 수 있어요.
- 신고하면 대상과 앞뒤 최대 10개씩(대화 신고는 최근 50개)을 `chat_report_evidence`에 그대로 고정해요. 관리자 신고 문맥은 이 스냅샷만 읽어요.
- 신고 문맥에 포함된 사진은 별도 ADMIN 사진 경로로 읽어요.
- 관리자 원문·사진 조회는 `chat_report_access_audit`에 관리자 ID·사건 ID·대상 ID·시각·행동·목적(`REPORT_REVIEW`)으로 기록해요.
- 관리자 신고 목록의 `보존 설정`에서 자료 분류·파기 보류·실제 계약 기산일·변경 근거를 저장해요. 변경 행동은 `RETENTION_CHANGE`로 기록해요.
- 기존·신규 신고는 `UNCLASSIFIED`로 시작해요. 이미 확정한 3년·5년 법정 최소 보존기간은 분류를 바꿔도 줄어들지 않아요.

## 90일 보존과 파기

- 원문·사진은 메시지 생성 후 90일간 보존해요.
- 파기 worker는 메시지 행을 남기고 본문·사진 참조만 비운 뒤, 화면에 `보존 기간이 지난 메시지입니다.`로 보여 줘요.
- 보존 중인 신고 스냅샷 사진은 유지해요. 신고·증거가 만료되면 다른 대화·신고 참조가 없는 사진만 S3 삭제 outbox로 보내요.
- 신고·증거는 위 1년·3년·5년 분류를 적용하고, 미분류·미처리·수동 보류와 스냅샷이 없는 이전 신고는 원문 파기를 막아요.
- 관리자 접근 기록은 신고 처리일 대신 각 접근일부터 1년(법령상 대상이면 2년) 보존해요. 신고가 만료되어도 최근 접근 기록은 남겨요. 미처리·미분류·수동 보류 신고의 기록은 파기하지 않아요.
- 스케줄러는 10분마다 후보를 최대 50개씩 읽고, 개별 항목의 방 잠금 안에서 조건을 다시 확인해요. 90일 파기는 메시지 행과 읽음·취소 커서를 유지해요.
- 개인정보처리방침과 대화 화면에 정책을 고지해요. `GET /api/chat/retention-policy`는 실제 고지·적용 예정 시각과 활성 상태만 공개해요.

| 이름 | 용도 |
|---|---|
| `CHAT_RETENTION_ENABLED` | 글·사진·신고 증거·접근 기록 파기 스위치, 기본 `false` |
| `CHAT_RETENTION_NOTICE_PUBLISHED_AT` | 실제 운영 고지 게시 시각, offset 포함 ISO-8601. 이 시각부터 30일 유예 |
| `CHAT_RETENTION_ACCESS_AUDIT_YEARS` | 관리자 접근 기록 1년 또는 2년, 기본 `1`. 다른 값이면 전체 파기 중지 |

## API와 스키마

| 대상 | 계약 |
|---|---|
| `POST /api/chat/rooms/{roomId}/messages/{messageId}/retract` | 인증·방 접근·실제 발신자 확인, 멱등 취소 |
| `GET /api/chat/rooms/{roomId}/retractions?afterRevision=0` | 취소 변경 조회, 최대 100개, `messages/nextRevision/hasMore` |
| `PUT /api/chat/rooms/{roomId}/visibility?viewerRole=MEMBER&hidden=true` | 본인 목록 숨김·복원 |
| `GET /api/chat/conversations` / `/store-inbox`의 `hidden=true` | 숨긴 목록 조회, 기본값 false |
| `GET /api/chat/retention-policy` | 인증 없이 고지·유예·실행 상태 조회 |
| `GET` / `PATCH /api/admin/chat/reports/{reportId}/retention` | 관리자 전용 보존 분류·보류·근거 관리 |
| `chat_room.retraction_revision` | BIGINT NOT NULL DEFAULT 0 |
| `chat_message.retracted_at` | DATETIME(6) NULL |
| `chat_message.retraction_revision` | BIGINT NULL; `(room_id,retraction_revision)` 인덱스 |
| `chat_room.member_hidden_at` / `owner_hidden_at` / `owner_hidden_by_member_id` | nullable DATETIME(6) / DATETIME(6) / BIGINT |
| `chat_message.purged_at` | nullable DATETIME(6), `(purged_at,created_at,id)` 인덱스 |
| `chat_report.evidence_captured_at` | nullable DATETIME(6), 스냅샷 고정 시각 |
| `chat_report_evidence` / `chat_report_access_audit` | 신고 스냅샷 / 원문 접근 기록 |
| `chat_message.image_original_filename` / `chat_report_evidence.image_original_filename` | nullable VARCHAR(255), 안전한 원래 다운로드 파일명 |
| `chat_report.retention_*` / `minimum_retention_until` | 자료 분류·보류·기산일·근거·법정 최소 보존 하한 |

취소 처리는 방을 `FOR UPDATE`로 잠근 뒤 권한을 확인하고 커서를 읽어요.

함께 볼 문서: [채팅 사진 키](chat-images.md), [수동 DDL](manual-ddl.md).
