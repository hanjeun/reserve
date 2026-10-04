# 채팅 입력·설정·전송 취소

2026-10-04 결정: 일반 신고 증거와 해당 열람 기록은 신고 처리 완료 후 1년 보존해요.
미처리 신고·진행 중인 분쟁은 파기를 보류하고, 거래·결제 분쟁 자료는 별도 법정 보존 기준을 적용해요.
현재 신고 증거의 기간 파기 작업자는 없어요. 거래 분쟁 분류·기존 자료 적용일을 확정한 뒤 구현해요.

채팅 입력창, 전송 취소, 목록 숨김, 신고 증거, 90일 보존 규칙을 정리해요.

## 입력과 전송

- 고객·사업자·관리자가 같은 입력창을 써요. 도구는 사진 첨부와 검색 가능한 이모지예요. 사진은 [채팅 사진 키](chat-images.md)가 설정된 환경에서만 보여요.
- Enter는 전송, Shift+Enter는 줄바꿈이고, 한글 조합 중에는 전송하지 않아요.
- 전송 중 정지 버튼은 브라우저 요청만 중단해요. 재시도는 같은 `clientMessageId`로 중복 저장을 막아요.
- 전송 전 사진 썸네일은 `useImagePreview`를 써요.

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

## 90일 보존과 파기

- 원문·사진은 메시지 생성 후 90일간 보존해요.
- 파기 worker는 메시지 행을 남기고 본문·사진 참조만 비운 뒤, 화면에 `보존 기간이 지난 메시지입니다.`로 보여 줘요.
- 신고 스냅샷에 들어간 사진은 파기하지 않고, 나머지 사진은 S3 삭제 outbox로 보내요.
- 신고 증거와 열람 기록은 자동 파기 대상이 아니에요.

| 이름 | 용도 |
|---|---|
| `CHAT_RETENTION_ENABLED` | 90일 파기 worker 실행 여부 |

## API와 스키마

| 대상 | 계약 |
|---|---|
| `POST /api/chat/rooms/{roomId}/messages/{messageId}/retract` | 인증·방 접근·실제 발신자 확인, 멱등 취소 |
| `GET /api/chat/rooms/{roomId}/retractions?afterRevision=0` | 취소 변경 조회, 최대 100개, `messages/nextRevision/hasMore` |
| `PUT /api/chat/rooms/{roomId}/visibility?viewerRole=MEMBER&hidden=true` | 본인 목록 숨김·복원 |
| `GET /api/chat/conversations` / `/store-inbox`의 `hidden=true` | 숨긴 목록 조회, 기본값 false |
| `chat_room.retraction_revision` | BIGINT NOT NULL DEFAULT 0 |
| `chat_message.retracted_at` | DATETIME(6) NULL |
| `chat_message.retraction_revision` | BIGINT NULL; `(room_id,retraction_revision)` 인덱스 |
| `chat_room.member_hidden_at` / `owner_hidden_at` / `owner_hidden_by_member_id` | nullable DATETIME(6) / DATETIME(6) / BIGINT |
| `chat_message.purged_at` | nullable DATETIME(6), `(purged_at,created_at,id)` 인덱스 |
| `chat_report.evidence_captured_at` | nullable DATETIME(6), 스냅샷 고정 시각 |
| `chat_report_evidence` / `chat_report_access_audit` | 신고 스냅샷 / 원문 접근 기록 |

취소 처리는 방을 `FOR UPDATE`로 잠근 뒤 권한을 확인하고 커서를 읽어요.

함께 볼 문서: [채팅 사진 키](chat-images.md), [수동 DDL](manual-ddl.md).
