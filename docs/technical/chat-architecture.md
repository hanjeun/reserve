# 채팅 설정과 확장 판단

상태: 현재 구현 점검 및 후속 제안. 2026-09-28. 새 DB·유료 인프라 도입을 승인하거나 실행한 기록이 아니다.

## 설정의 적용 범위

| 설정 | 위치 / 현재 상태 |
|---|---|
| 말풍선 색 | 채팅 설정만. `reserve:chat-color` 기기별 저장소를 설정과 말풍선이 구독 |
| 앱 모양·글꼴·포인트 색 | 마이페이지. 사이트와 채팅에 같은 테마 토큰 적용 |
| UI 언어 | 현재 한국어만. `App.jsx`의 AntD locale은 `koKR`; 자체 문구/오류 번역 체계는 미구현 |
| 향후 UI 언어 | 앱 전체 일반 설정/마이페이지를 정본으로 두고 채팅도 같은 locale을 사용하도록 제안 |
| 향후 대화 번역 | UI 언어와 다른 기능. 구현하게 되면 채팅 설정에 별도 배치; 현재 자동 번역 없음 |

번역되지 않은 선택지를 만들지 않는다. 다국어 도입에는 문구 사전, 서버 오류 코드/문구 분리,
날짜·숫자 포맷, 접근성 라벨, 폴백과 테스트가 필요하다. AntD locale만 교체해서 전체 앱을 번역할 수는 없다.

## 입력과 단순 선택

공통 `FormSelect`·`FilterSelect`는 rc-select가 넘긴 `readOnly`를 유지한다.
`ChoiceSelectInput`은 읽기 전용 input에만 `inputMode="none"`을 지정한다. 검색 활성화·tags·기본 multiple은
편집 가능한 기존 계약을 유지한다. Tab·방향키·Enter 및 ARIA 연결을 제거하거나 무조건 blur하지 않는다.
검색 페이지/메시지/이모지 검색은 실제 입력이며 키보드가 필요한 경로다.
자동 브라우저의 readonly/inputmode 검사는 실제 iOS 가상 키보드·시뮬레이터 확장 동작 실증을 대신하지 않는다.

## 숨김·취소·파기는 다르다

- 현재 `내 목록에서 숨기기`는 본인 목록만 숨기며 복원 가능하다. 대화 전체 삭제/영구 나가기 기능이 아니다.
- 본인 전송 취소는 시간 제한 없이 가능하지만 일반 응답만 마스킹하고 보존 정책을 유지한다.
- 일반 원문/사진은 90일 보존 정책의 대상, 신고 증거는 별도 보류다. 파기 worker의 기본값은 OFF다.
- 향후 `대화 나가기`를 만들려면 참가자별 마지막 나간 메시지 ID 등 조회 경계를 설계해야 한다.
  본인 화면의 이전 기록을 비우는 것과 상대방 기록/신고 증거를 없애는 것을 분리한다. 현 기능을
  `대화 모두 삭제`로 이름만 바꾸거나 실제 원장을 일괄 삭제하지 않는다.

## DB / 전달 구조

현재: 단일 Spring 앱의 채팅 서비스·MySQL 원장 + 비공개 암호화 S3 사진.
메시지는 `(room_id,id)` 인덱스와 과거 이력 cursor/Slice, 전송 멱등 키, 방 잠금, 신고 증거/감사 원장이 있다.
활성 thread는 기본 4초 증분 폴링, 목록 30초·닫힌 런처 알림 60초 갱신이다.

지금 새 DB로 이관할 근거가 되는 운영 부하 측정은 없다. MySQL과 S3를 유지하는 안을 제안한다.
우선 관측할 것은 동시 열린 대화 수, 폴링 QPS, 조회 p95/p99, MySQL CPU/IO·행 잠금·커넥션 대기,
메시지/사진 증가량, 전달 지연과 중복/누락률이다. 임의 사용자 수만으로 이관을 결정하지 않는다.

후속 순서:

1. 일부 증분 조회가 `List`로 무제한 반환되는 것과 숨긴 탭의 thread 주기 요청을 제한/백오프로 보강할지 검토.
   현재 이미 bounded라는 주장은 하지 않는다. 이번 UI 수정에서는 백엔드 계약을 변경하지 않았다.
2. 부하/전달 지연이 문제이면 SSE/WebSocket을 전달 계층에 추가하고 MySQL을 원장으로 유지.
   재연결 cursor, 권한 재검증, 전송 확인/멱등성, 유실 복구를 함께 설계한다.
3. 앱 다중 인스턴스에서 필요할 때 Redis Pub/Sub 또는 외부 broker를 중계로 검토.
   중계 캐시/비영속 Pub/Sub를 메시지 원장으로 쓰지 않는다.
4. 관측된 MySQL 한계를 넘을 때에만 저장소 분리를 ADR로 재결정. 신고·보존·감사·백업/복원과
   복수 DB의 dual-write 정합성 비용을 포함한다. 이번 릴리스에는 MongoDB·Redis·Kafka를 추가하지 않는다.

근거: [MySQL 복합 인덱스](https://dev.mysql.com/doc/refman/8.4/en/multiple-column-indexes.html),
[Spring 외부 STOMP broker](https://docs.spring.io/spring-framework/reference/web/websocket/stomp/handle-broker-relay.html).

## CI 화면

Actions 요약 그래프의 `build-backend`·`build-frontend`는 필수 체크 job ID다. 그래프에 테스트 job이
별도로 보이지 않는 것과 테스트가 없는 것은 다르다. 각 job을 열면 아래 step이 명시적으로 표시된다.

- `Test backend (unit and Spring/H2 integration)` → `Package backend bootJar` → rollback 호환 검사
- `Test frontend (unit and React components)` / `Test repository quality policies`
- `Test PC browser (Chromium)` / `Test mobile browser (Pixel 7 Chromium)` → `Build React app`

PR에서는 배포가 skip되는 것이 의도된 계약이다. `main` push에서만 staging·health·동시 전환·smoke가
실행된다. 현재 CI의 H2/Chromium 성공을 MySQL·실제 Safari·PG/S3 운영 실증으로 표시하지 않는다.
필수 체크 이름을 바꾸려면 GitHub 브랜치 보호 설정도 함께 이관해야 하므로 표시만 보고 임의 변경하지 않는다.
