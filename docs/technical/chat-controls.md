# 채팅 입력·설정·전송 취소

채팅 입력창, 전송 취소, 목록 숨김, 신고 증거와 90일 보존 규칙을 정리해요.

## 입력과 전송

- 고객·사업자·관리자가 같은 입력창을 써요. 도구는 사진 첨부와 검색 가능한 Unicode 이모지예요. 일반 문서 업로드·유료 번역·SMS는 없어요. 사진은 서버 키 설정이 유효한 환경에서만 보여요([채팅 사진 키](chat-images.md)).
- Enter는 전송, Shift+Enter는 줄바꿈이에요. 한글 IME 조합 중에는 전송하지 않아요.
- 전송 중 정지 버튼은 브라우저 요청만 중단해요. 서버에 이미 저장됐을 수 있어 저장 취소를 보장하지 않아요. 같은 사진/내용의 재시도는 같은 `clientMessageId`로 중복 저장을 막아요.
- 전송 전 썸네일은 `useImagePreview`를 써요. 사진 제거·세션 변경 때 미리보기 Blob을 버려요. 썸네일에 초점이 있어도 Escape는 확대 화면만 닫고 채팅창은 유지해요.
- 이모지 창을 열거나 고를 때 모바일 입력/검색에 강제로 초점을 주지 않아요. 검색을 직접 누르면 키보드가 열려요.

## 전송 취소

- 보낸 메시지의 관리 메뉴에서 **시간 제한 없이** 취소할 수 있어요. 현재 방 접근권과 실제 발신자 ID가 모두 맞아야 해요. 역할만 같다고 취소할 수 없고, 다른 관리자의 답장도 취소할 수 없어요.
- 응답에 발신자 ID를 노출하지 않고, 인증된 조회자 기준 `canRetract`만 줘요.
- 양쪽 일반 화면에는 회색 토큰의 `전송이 취소된 메시지입니다.`가 보이고, 일반 사진 조회는 404예요. 서버 일반 응답은 원문·사진 주소를 지워요. 이미 읽거나 다운로드한 사본은 회수하지 못해요.
- 취소는 메시지 행이나 S3 객체를 지우지 않아요. 원문·사진은 신고·분쟁 검토용으로 보존하고, 권한 있는 신고 컨텍스트에서만 제공해요.
- 오래된 메시지 취소도 `retractionRevision`으로 폴링해요. 새 메시지 ID, 정렬 시각, 읽지 않은 수는 바뀌지 않아요.
- PC 관리 메뉴는 내 말풍선 왼쪽에 있고 hover·키보드 포커스 때 보여요. 터치에서는 44px 버튼을 항상 둬요.

## 설정과 화면

- 말풍선 색은 메신저 설정에만 있어요. 설정과 말풍선이 하나의 저장소를 구독하며 **기기별**이에요. 계정·기기 간 동기화, 상대방 색 변경, 사이트 브랜드 색 변경은 아니에요.
- 마이페이지에는 앱 전체 모양·글꼴·포인트 색만 남겨요.
- 기본 배경은 paper 토큰(라이트의 흰색)이고, 다크 모드도 같은 토큰을 따라요. 하단 내비게이션은 반투명이에요.
- 들어가기/뒤로가기는 반대 방향으로 같은 260ms·가속 곡선을 쓰고, 전환 중 재진입을 막아요. `reverse` 재생은 가속 곡선까지 뒤집으므로 진입은 별도 keyframe이고, 나가는 목록은 끝에서 투명해져요.

## 닫기와 새로고침

- 모바일 홈·대화 목록·설정·대화 내부에 44×44px X를 둬요. X는 메시지를 지우지 않고, `/messages` 닫힘 애니메이션 뒤 이전 화면(직접 진입이면 홈)으로 돌아가요. 대화 안의 ←는 목록으로만 돌아가요. PC 패널 X와 같은 디자인 규칙이에요.
- 메신저 목록과 공통 `RefreshButton`은 `useRefreshCooldown`의 클릭 후 3초 제한을 공유해요. 요청 중에는 같은 `SyncOutlined`가 회전하고, 요청이 끝난 뒤 남은 쿨다운에는 회전·`aria-busy`를 표시하지 않아요. 자동 목록 조회는 30초 간격이에요.

> 주의: 쿨다운은 브라우저 연타 방지일 뿐 서버 보안 제한이 아니에요. 목록 GET에는 전용 Bucket4j 정책이 없고, nginx 설정의 API/IP `20r/s`, burst 40 제한만 따로 있어요.

## 목록 숨김

- 숨김은 MEMBER/OWNER 축별이에요. 상대 화면·신고 FK·참가 권한은 지우지 않고, 상대를 차단하지도 않아요.
- `숨긴 대화 보기`에서 복원하거나 신고할 수 있어요. 새 메시지가 오면 다시 목록에 보여요.
- 가게 소유자가 바뀌면 이전 소유자의 숨김은 승계하지 않아요. 관리자 공유 고객지원 받은편지함은 숨기지 않아요.
- 숨김은 본인 목록만 가리는 기능이에요. 대화 전체 삭제·영구 나가기와의 차이는 [채팅 설정과 확장 판단](chat-architecture.md)을 봐 주세요.

## 신고 증거

- 가게 대화 참가자는 취소된 상대 메시지도 메뉴에서 `messageId`로 신고할 수 있어요.
- 새 신고는 대상과 앞뒤 최대 10개씩(대화 신고는 최근 50개)을 `chat_report_evidence`에 접수 시점 그대로 고정해요. ADMIN 전용 신고 컨텍스트는 이 스냅샷만 읽어요.
- 사진은 신고 컨텍스트에 포함된 ID만 별도 ADMIN 사진 경로로 읽어요. 일반 사진 경로는 관리자여도 취소된 사진을 404로 처리해요.
- 관리자 원문·사진 조회는 `chat_report_access_audit`에 관리자 ID·사건 ID·대상 ID·UTC 시각·행동·목적(`REPORT_REVIEW`)을 별도 트랜잭션으로 남겨요. 감사 저장이 실패하면 원문 응답도 실패하고, 원문은 로그에 넣지 않아요.
- 사진 S3 객체는 암호화되지만, DB 텍스트 원문은 별도 암호화하지 않아요. DB 관리자 자체 접근의 감사·변조 방지도 아직 없어요.

## 90일 보존과 파기

- 원문·사진의 일반 보존 기간은 **메시지 생성 후 90일**이에요.
- 파기 worker는 메시지 행을 지우지 않고 본문·사진 참조를 비운 뒤, 변경 커서로 `보존 기간이 지난 메시지입니다.`를 알려요. 보낸 메시지 재시도 ID는 중복 방지를 위해 남겨요.
- 신고 스냅샷에 참조된 사진은 파기하지 않고, 그 외 사진은 기존 S3 삭제 outbox에 넣어요.
- 신고 증거와 열람 기록은 90일 파기 대상이 아니며 **자동 파기하지 않아요**. 무기한 보존의 법적 적정성은 확인되지 않았으니 보존 목적·접근권·정책 고지를 재검토해야 해요.
- 이전 신고(`evidence_captured_at` NULL)는 스냅샷을 고정하기 전까지 해당 방의 파기를 보류해요.
- `CHAT_RETENTION_ENABLED` 기본값은 false예요. 추가 DDL·개인정보 고지·기존 데이터 영향·복구 호환 검증 전에는 운영에서 켜지 않아요. 백업 복사본의 보존 기간은 별도예요.

## API와 DDL

| 대상 | 계약 |
|---|---|
| `POST /api/chat/rooms/{roomId}/messages/{messageId}/retract` | 인증·방 접근·실제 발신자 확인, 멱등 취소, 전송 limiter 적용 |
| `GET /api/chat/rooms/{roomId}/retractions?afterRevision=0` | 인증·방 접근 확인, 최대 100개, `messages/nextRevision/hasMore` |
| `PUT /api/chat/rooms/{roomId}/visibility?viewerRole=MEMBER&hidden=true` | 본인 참가 축의 목록 숨김·복원, 방 잠금, 원장 삭제 아님 |
| `GET /api/chat/conversations` / `/store-inbox`의 `hidden=true` | 숨긴 목록 서버 pagination, 기본값 false |
| `chat_room.retraction_revision` | BIGINT NOT NULL DEFAULT 0 |
| `chat_message.retracted_at` | DATETIME(6) NULL |
| `chat_message.retraction_revision` | BIGINT NULL; `(room_id,retraction_revision)` 인덱스 |
| `chat_room.member_hidden_at` / `owner_hidden_at` / `owner_hidden_by_member_id` | nullable DATETIME(6) / DATETIME(6) / BIGINT |
| `chat_message.purged_at` | nullable DATETIME(6), `(purged_at,created_at,id)` 인덱스 |
| `chat_report.evidence_captured_at` | nullable DATETIME(6), 이전 신고 파기 보류 표식 |
| `chat_report_evidence` / `chat_report_access_audit` | 신고 스냅샷 / 원문 접근 감사, 일반 API에 노출하지 않음 |

방을 먼저 `FOR UPDATE`로 잠근 뒤 권한을 확인하고 커서를 읽어요. 읽기 조회로 먼저 로드한 오래된 managed entity를 재사용해 동시 취소의 커서가 겹치는 걸 막아요.

## 롤백 호환

- `scripts/prepare-v270-rollback.mjs`는 v2.6.3 고정 커밋에서 채팅 읽기 호환 패치만 만들어요. OWNER 역직렬화, 일반 응답의 취소 원문 마스킹, 구 관리자 API의 SUPPORT 한정, 사진 자리표시자를 포함해요.
- CI가 이 호환 JAR을 격리 빌드해 보관하고, 승인된 main push에서만 `rollback-v263-v270-<SHA>` Docker 이미지를 발행해요. `latest`는 덮지 않아요.
- main 병합 전 DDL 관문에서 검증된 같은 JAR의 호환 서버를 먼저 준비해요.

> 주의: v2.6.3 원본 이미지로 새 채팅 데이터를 읽는 롤백은 허용하지 않아요. 격리 환경의 호환 서버 성공이 운영 롤백 검증을 대신하지도 않아요.

## 남은 과제

1. 고객지원(SUPPORT) 신고, 과거 가게 소유권 이력 기반 접근권, 사건별 보류 해제·증거 파기·열람 원장 조회 UI
2. 사진의 GCM 무결성 검증 외 별도 원본 해시/서명, DB 운영자 변조 방지 저장소
3. 카카오톡식 메시지별 `1` 표시. 방 단위 unread를 메시지마다 복사하지 않고, 상대의 마지막 읽음 메시지 ID를 서버에 기록해 폴링으로 반영해야 해요. 고객지원 다중 관리자 읽음 규칙도 필요해요.

함께 볼 문서: [채팅 사진 키](chat-images.md), [수동 DDL](manual-ddl.md), [배포 런북](deployments.md).
