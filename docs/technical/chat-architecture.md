# 채팅 설정과 확장 판단

채팅 설정의 적용 범위와, 저장·전달 구조를 언제 어떻게 확장할지에 대한 판단이에요. 새 DB나 유료 인프라 도입을 승인한 문서는 아니에요.

## 설정의 적용 범위

| 설정 | 위치 / 현재 상태 |
|---|---|
| 말풍선 색 | 채팅 설정만. `reserve:chat-color` 기기별 저장소를 설정과 말풍선이 구독 |
| 앱 모양·글꼴·포인트 색 | 마이페이지. 사이트와 채팅에 같은 테마 토큰 적용 |
| UI 언어 | 한국어만. `App.jsx`의 AntD locale은 `koKR`, 자체 문구/오류 번역 체계는 없음 |
| 향후 UI 언어 | 앱 전체 일반 설정/마이페이지가 정본, 채팅도 같은 locale 사용(제안) |
| 향후 대화 번역 | UI 언어와 다른 기능. 만든다면 채팅 설정에 별도 배치. 현재 자동 번역 없음 |

번역되지 않은 선택지는 만들지 않아요. 다국어에는 문구 사전, 서버 오류 코드/문구 분리, 날짜·숫자 포맷, 접근성 라벨, 폴백과 테스트가 필요해요. AntD locale만 바꿔서 앱 전체를 번역할 수는 없어요.

## 입력과 단순 선택

- 공통 `FormSelect`·`FilterSelect`는 rc-select가 넘긴 `readOnly`를 유지해요.
- `ChoiceSelectInput`은 읽기 전용 input에만 `inputMode="none"`을 줘요. 검색 활성화·tags·기본 multiple은 편집 가능한 기존 계약 그대로예요.
- Tab·방향키·Enter와 ARIA 연결을 없애거나 무조건 blur하지 않아요.
- 검색 페이지·메시지·이모지 검색은 실제 입력이라 키보드가 필요해요.

> 주의: 자동 브라우저의 readonly/inputmode 검사는 실제 iOS 가상 키보드 동작 검증을 대신하지 않아요.

## 숨김·취소·파기는 다르다

- `내 목록에서 숨기기`는 본인 목록만 가리고 복원할 수 있어요. 대화 전체 삭제·영구 나가기가 아니에요.
- 본인 전송 취소는 시간 제한 없이 가능하지만, 일반 응답만 마스킹하고 보존 정책은 유지해요.
- 일반 원문·사진은 90일 보존 대상이고, 신고 증거는 따로 보류해요. 파기 worker 기본값은 OFF예요.
- `대화 나가기`를 만들려면 참가자별 마지막 나간 메시지 ID 같은 조회 경계를 설계해야 해요. 내 화면의 이전 기록을 비우는 것과 상대 기록·신고 증거를 없애는 것은 분리해요. 현 기능을 `대화 모두 삭제`로 이름만 바꾸거나 원장을 일괄 삭제하지 않아요.

자세한 규칙은 [채팅 입력·설정·전송 취소](chat-controls.md)에 있어요.

## 저장·전달 구조

현재는 단일 Spring 앱의 채팅 서비스 + MySQL 원장 + 비공개 암호화 S3 사진이에요.

- 메시지에 `(room_id,id)` 인덱스, 과거 이력 cursor/Slice, 전송 멱등 키, 방 잠금, 신고 증거·감사 원장이 있어요.
- 열린 대화는 4초 증분 폴링, 목록은 30초, 닫힌 런처 알림은 60초 주기예요.

새 DB로 옮길 근거가 되는 운영 부하 측정은 없어서 MySQL과 S3를 유지해요. 이관 판단 전에 다음을 먼저 관측해요. 임의 사용자 수만으로 결정하지 않아요.

- 동시 열린 대화 수, 폴링 QPS, 조회 p95/p99
- MySQL CPU/IO·행 잠금·커넥션 대기
- 메시지·사진 증가량, 전달 지연, 중복/누락률

확장 순서:

1. 일부 증분 조회가 `List`로 무제한 반환되는 것과, 숨긴 탭의 대화 주기 요청을 제한/백오프로 보강할지 검토해요. 지금 bounded라고 주장하지 않아요.
2. 부하·전달 지연이 문제면 전달 계층에 SSE/WebSocket을 추가하고 MySQL을 원장으로 유지해요. 재연결 cursor, 권한 재검증, 전송 확인/멱등성, 유실 복구를 함께 설계해요.
3. 앱이 다중 인스턴스가 되면 Redis Pub/Sub 또는 외부 broker를 중계로 검토해요. 비영속 Pub/Sub를 메시지 원장으로 쓰지 않아요.
4. 관측된 MySQL 한계를 넘을 때만 저장소 분리를 ADR로 재결정해요. 신고·보존·감사·백업/복원과 dual-write 정합성 비용을 포함해요. 지금은 MongoDB·Redis·Kafka를 추가하지 않아요.

근거: [MySQL 복합 인덱스](https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html),
[Spring 외부 STOMP broker](https://docs.spring.io/spring-framework/reference/web/websocket/stomp/handle-broker-relay.html).

## CI 화면 읽는 법

Actions 요약 그래프의 `build-backend`·`build-frontend`는 필수 체크 job ID예요. 그래프에 테스트 job이 따로 안 보여도 테스트는 각 job 안의 step으로 돌아요.

- `Test backend (unit and Spring/H2 integration)` → `Package backend bootJar` → rollback 호환 검사
- `Test frontend (unit and React components)` / `Test repository quality policies`
- `Test PC browser (Chromium)` / `Test mobile browser (Pixel 7 Chromium)` → `Build React app`

PR에서 배포가 skip되는 건 의도된 동작이에요. staging·health·동시 전환·smoke는 `main` push에서만 돌아요. H2/Chromium 성공을 MySQL·실제 Safari·PG/S3 운영 검증으로 보지 않아요.

> 주의: 필수 체크 이름을 바꾸려면 GitHub 브랜치 보호 설정도 함께 옮겨야 해요. 표시만 보고 임의로 바꾸지 않아요.
