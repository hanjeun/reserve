# 채팅 입력·설정·전송 취소

기준: 2026-09-27. v2.7.0 후보 코드이며 **운영 배포 완료가 아니다**.

## 사용자 계약

- 고객·사업자·관리자는 같은 입력창을 쓴다. 아래 도구는 사진 첨부와 검색 가능한 Unicode 이모지다.
  일반 문서 업로드·유료 번역·SMS는 포함하지 않는다. 사진은 기존 서버 키 설정이 유효한 환경에서만 표시된다.
- Enter는 전송, Shift+Enter는 줄바꿈이다. 한글 IME 조합 중에는 전송하지 않는다.
- 전송 중 정지 버튼은 브라우저 요청을 중단한다. 서버에 이미 저장됐을 수 있으므로 저장 취소를 보장하지 않는다.
  같은 사진/내용의 재시도는 같은 `clientMessageId`를 사용해 중복 저장을 막는다.
- 보낸 메시지의 관리 메뉴에서 **시간 제한 없이** 전송 취소할 수 있다. 역할만 같다고 취소할 수 없으며
  현재 방 접근권과 실제 `senderMemberId`가 모두 일치해야 한다. 다른 관리자의 답장도 취소할 수 없다.
- 양쪽 일반 화면은 취소 표시를 받고, 일반 사진 조회는 404다. 이미 읽거나 다운로드한 사본은 회수하지 못한다.
  원문·사진은 신고·분쟁 검토용으로 보존하며 권한 있는 신고 컨텍스트에서만 제공한다.
- 오래된 메시지 취소도 `retractionRevision`으로 폴링한다. 새 메시지 ID, 정렬 시각과 읽지 않은 개수를 변경하지 않는다.
- 말풍선 색은 마이페이지와 메신저 설정이 하나의 저장소를 구독한다. 현재 디자인 설정처럼 **기기별**이며,
  계정 간/다른 기기 간 동기화나 상대방의 색 변경 기능은 아니다. 사이트 전체 브랜드 색을 바꾸지 않는다.
- 기본 배경은 paper 토큰(라이트의 흰색)으로 통일한다. 다크 모드는 같은 토큰을 따르며 하단 내비게이션은 반투명이다.
  들어가기/뒤로가기는 같은 keyframe을 정방향/역방향으로 사용하고 전환 중 재진입을 막는다.

## API와 추가 DDL

| 대상 | 계약 |
|---|---|
| `POST /api/chat/rooms/{roomId}/messages/{messageId}/retract` | 인증·방 접근·실제 발신자 확인, 멱등 취소, 전송 limiter 적용 |
| `GET /api/chat/rooms/{roomId}/retractions?afterRevision=0` | 인증·방 접근 확인, 최대 100개, `messages/nextRevision/hasMore` |
| `chat_room.retraction_revision` | BIGINT NOT NULL DEFAULT 0 |
| `chat_message.retracted_at` | DATETIME(6) NULL |
| `chat_message.retraction_revision` | BIGINT NULL; `(room_id,retraction_revision)` 인덱스 |

방을 먼저 `FOR UPDATE`로 잠근 뒤 권한을 확인하고 커서를 읽는다. 읽기 조회로 먼저 로드한 오래된
managed entity를 재사용해 동시 취소의 커서가 겹치는 것을 방지한다.

## 이번 실행 증거와 미완료

- 백엔드 표적 19개, 추가 UI/상태 검사와 PC·모바일 표적 검사를 실행했다. 최종 전체 CI는 새 후보 SHA에서 다시 확인한다.
- 기존 9/26 gzip 백업을 격리 MySQL 8.0.45에 복원: 28/28 테이블 행 수 일치. 추가 DDL 이후 31테이블,
  오래된 ID의 변경 커서·원문 보존·중복 ID 거부·방 행 잠금을 확인했다. 검사용 DB만 삭제했다.
  운영 DB ALTER는 아직 하지 않았다. 이 SQL 검사는 실행 중인 Java 서비스의 운영 실증을 대신하지 않는다.
- `scripts/prepare-v270-rollback.mjs`는 운영 v2.6.3의 고정 SHA에서 채팅 읽기 호환 패치만 만든다.
  OWNER 역직렬화, 일반 응답의 취소 원문 마스킹, 구 관리자 API의 SUPPORT 한정, 사진 자리표시자를 포함한다.
  별도 작업공간에서 JPA/동시성 4개와 bootJar가 통과했다. CI에서도 격리 빌드해 복구용 JAR을 보관한다.
  승인된 main push에서만 `rollback-v263-v270-<SHA>` Docker 이미지를 발행하며, `latest`를 덮지 않는다.
  main 병합 전 DDL 관문에는 검증된 같은 JAR의 호환 서버를 먼저 별도로 준비해야 한다.
- **호환 JAR 존재 ≠ 운영 롤백 준비 완료.** 호환 Docker 이미지·서버 health·기존 프론트 연결·동시 전환 및
  실패 복구를 실증해야 한다. v2.6.3 원본 이미지로 신규 채팅 데이터를 읽는 롤백은 허용하지 않는다.
- Sonar 자동 분석은 보존용 스냅샷을 실행 코드로 세지 않도록 정리하고 실제 테스트 경로를 분리한다.
  `.sonarcloud.properties`는 기본 브랜치 적용 및 새 분석 결과를 확인해야 하며, 기존 실패를 통과로 표시하지 않는다.
- TEST PG·실제 S3 사진 왕복/삭제 outbox·두 계정 취소/신고·운영 배포 증거는 별도 관문이다.

[사진 키와 복구](chat-images.md), [수동 DDL](manual-ddl.md), [배포 런북](deployments.md)을 함께 따른다.
