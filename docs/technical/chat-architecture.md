# 채팅 설정과 구조

채팅 설정이 어디에 적용되는지와 채팅의 저장·전달 구조를 정리해요.

## 설정의 적용 범위

| 설정 | 위치 |
|---|---|
| 말풍선 색 | 채팅 설정. `reserve:chat-color` 기기별 저장소를 설정과 말풍선이 함께 구독 |
| 앱 모양·글꼴·포인트 색 | 마이페이지. 사이트와 채팅에 같은 테마 토큰 적용 |
| UI 언어 | 한국어만. `App.jsx`의 AntD locale은 `koKR` |

## 입력과 단순 선택

- 공통 `FormSelect`·`FilterSelect`는 rc-select가 넘긴 `readOnly`를 유지해요.
- `ChoiceSelectInput`은 읽기 전용 input에만 `inputMode="none"`을 줘요. 검색·tags·multiple은 편집 가능한 입력 그대로예요.
- 검색 페이지·메시지·이모지 검색은 실제 입력이라 키보드가 열려요.

## 숨김·취소·파기

- `내 목록에서 숨기기`는 본인 목록만 가리고 복원할 수 있어요. 대화 삭제가 아니에요.
- 전송 취소는 시간 제한 없이 가능하고, 일반 응답만 가려요.
- 원문·사진은 90일 보존 대상이고, 신고 증거는 따로 보관해요.

자세한 규칙은 [채팅 입력·설정·전송 취소](chat-controls.md)에 있어요.

## 저장·전달 구조

단일 Spring 앱의 채팅 서비스, MySQL 원장, 비공개 암호화 S3 사진으로 구성돼요.

- 메시지는 `(room_id,id)` 인덱스, cursor 기반 과거 이력, 전송 멱등 키, 방 잠금, 신고 증거·감사 원장을 가져요.
- 열린 대화는 4초 증분 폴링, 목록은 30초, 닫힌 런처 알림은 60초 주기예요.

## CI 화면 읽는 법

Actions 요약의 `build-backend`·`build-frontend`는 필수 체크 job이에요. 테스트는 각 job 안의 step으로 돌아요.

- `Test backend (unit and Spring/H2 integration)` → `Package backend bootJar` → rollback 호환 검사
- `Test frontend (unit and React components)` / `Test repository quality policies`
- `Test PC browser (Chromium)` / `Test mobile browser (Pixel 7 Chromium)` → `Build React app`

staging·health·전환·smoke 배포 단계는 `main` push에서만 돌고, PR에서는 skip돼요.
