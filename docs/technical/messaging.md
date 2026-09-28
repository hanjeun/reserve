# 통합 메시지와 가게 문의

고객지원과 가게 문의를 하나의 메신저에서 보여 주고, 권한과 읽음 상태는 대화 유형별로 따로 관리해요.

## 대화 유형

| 유형 | 참가자 | 시작 조건 | 상대 받은편지함 |
|---|---|---|---|
| `SUPPORT` | 회원 ↔ RESERVE 관리자 | 로그인 회원이 고객지원 열기/첫 전송 | 관리자 채팅 탭 |
| `STORE` | 회원 ↔ 해당 가게의 현재 소유자 | 로그인 회원이 공개·운영 가능한 타인 가게에서 문의 | 사장님 `가게 받은 문의` |

- 가게 문의는 예약이 없어도 할 수 있어요. 자기 가게에는 문의할 수 없고, 삭제·정지된 가게에는 새 메시지를 보낼 수 없어요. 닫힌 가게의 기존 대화는 읽을 수 있어요.
- 관리자 고객지원 API는 `SUPPORT`만, 사장님 받은편지함은 `STORE`만 받아요.
- 비회원도 남기는 단건 문의 `Inquiry`와 로그인 사용자의 연속 대화 `ChatRoom`은 별개예요.
- 그룹방·직원 초대·담당자 배정·회원 간 DM은 없어요.

## 화면

- 우측 하단 launcher가 PC에서는 패널(최대 420px), 모바일에서는 `/messages` 전체 화면을 열어요. 가게 상세의 문의 버튼은 `/messages?storeId={id}`로 들어가요.
- launcher 사진은 `launcherImageSrc`, 홈 커버 사진은 `coverImageSrc`(기본 `/og-image.png`)로 바꿀 수 있어요.
- 하단 메뉴는 `홈 · 대화 · 설정`이에요. 대화 안에서는 하단 메뉴 대신 입력란을 보여 줘요.
- 패널과 모바일에서는 상대를 고르면 대화가 열리고, 뒤로가기로 목록에 돌아가요. PC `/messages`는 목록·내용 두 칸이에요.
- `내 대화`와 `가게 받은 문의`는 분리돼 있어 손님·사장님 역할의 읽음 수가 섞이지 않아요.
- 패널은 focus trap, `Escape` 닫기, launcher로 focus 복귀, reduced-motion, 44px 터치 영역을 지원해요.

### 표시 이름과 사진

- `SUPPORT` 상대와 ADMIN 발신자는 고객지원 표시 이름(기본 `RESERVE 고객지원`)으로 보여요. [채팅 관리](#채팅-관리)에서 바꿔요.
- 회원의 `STORE` 문의에는 가게 이름, 사장님 받은 문의에는 고객 이름을 보여 줘요.
- 내 사진은 `profileImageUrl`, 없으면 `profileImage`를 쓰고, 둘 다 없으면 이니셜로 표시해요.

### 입력

- Enter 전송, Shift+Enter 줄바꿈, 한글 조합 중 전송 안 함, 2000자 제한이에요.
- 사장님 작성란의 `답변 문구`는 고정 안내 문구를 입력란에 넣기만 하고 자동 전송하지 않아요.

## 저장과 갱신

- 메시지는 `chat_message`, 방 요약은 `chat_room`에 저장해요.
- 전송마다 `clientMessageId`를 만들고, 재시도에는 같은 값을 써요. `(room_id, sender_member_id, client_message_id)` 유일 제약과 방 행 잠금으로 중복 저장을 막아요.
- 처음에는 최근 50개를 받고, 위로 올리면 `beforeId` cursor로 과거 50개씩 가져와요.
- 열린 대화는 4초, 목록은 30초, 닫힌 launcher 배지는 60초마다 폴링해요. WebSocket은 쓰지 않아요.
- 홈·목록·설정을 여는 것만으로는 방을 만들거나 읽음 처리하지 않아요.
- 방을 빠르게 바꿔도 요청 세대로 이전 응답을 버려 새 화면을 덮지 않아요.
- 읽지 않은 수는 회원·관리자·사장님 세 축이에요. 창이 보이고 focus가 있을 때만 읽음 처리해요.
- 입력 초안은 대화별 세션 메모리에만 둬요(최대 20개, 각 2000자). 새로고침·로그아웃·계정 전환 때 사라져요.

## API

| 경로 | 역할 |
|---|---|
| `GET /api/chat/conversations` | 회원 관점의 고객지원·가게 문의 목록 |
| `GET /api/chat/support` / `POST /api/chat/support/messages` | 고객지원 열기·전송 |
| `GET /api/chat/stores/{storeId}` / `POST .../messages` | 손님 관점 가게 문의 열기·전송 |
| `GET /api/chat/store-inbox` | 소유 가게의 받은 문의 목록 |
| `GET /api/chat/store-inbox/{roomId}` / `POST .../messages` | 사장님 관점 열기·답장 |
| `GET /api/chat/rooms/{roomId}/messages?afterId=` | 참가자 증분 폴링 |
| `GET /api/chat/rooms/{roomId}/history?beforeId=&size=` | 참가자 cursor 과거 내역 |
| `POST /api/chat/rooms/{roomId}/read?viewerRole=` | 읽음 처리 |
| `PUT /api/chat/rooms/{roomId}/block?viewerRole=&blocked=` | 역할별 차단·차단 해제 |
| `POST /api/chat/rooms/{roomId}/reports?viewerRole=` | 대화 전체 또는 상대 메시지 신고 |
| `GET /api/chat/unread` | 회원·소유 가게를 합친 launcher 배지 |
| `GET /api/admin/chat/reports` / `GET .../{id}/context` | 관리자 신고 목록·문맥 조회 |
| `PATCH /api/admin/chat/reports/{id}` | 신고 검토 시작·조치 완료/기각 |

- `/api/chat/my*`와 관리자 `/api/admin/chat*` 경로도 기존 화면용으로 유지돼요.
- 관리자 증분 조회(`getNewMessagesAsAdmin`)는 `SUPPORT`만 허용해요. 가게 대화는 신고 문맥 API로만 봐요.

전송 취소·목록 숨김·보존 기간은 [채팅 입력·설정·전송 취소](chat-controls.md)에 있어요.

## 차단과 신고

메시지에는 수정·삭제 API가 없고, 회원 탈퇴·가게 폐업 뒤에도 남아요.

- 한쪽이라도 차단하면 양쪽 모두 새 전송이 막혀요. 각자 자기 차단만 해제할 수 있어요.
- 가게 쪽 차단은 가게 역할에 걸려 있어 소유자가 바뀌어도 이어져요.
- 신고 사유는 스팸·괴롭힘·부적절한 내용·사기·기타이고, 기타는 설명이 필수예요.
- 대화 전체 또는 상대 메시지를 신고할 수 있고, 같은 대상 신고는 한 번만 저장돼요.
- 신고는 회원별 10분 5건으로 제한해요. 신고만으로 자동 차단·제재하지 않아요.
- 관리자는 접수 → 검토 중 → 조치 완료/기각으로 처리하고, 종결에는 처리 근거가 필수예요.

## 채팅 첫 안내와 자동 문답

손님이 메시지가 없는 대화를 처음 열 때 보이는 안내예요. 고객지원은 관리자가, 가게 문의는 사장님이 설정하고, 설정이 없으면 기본 안내가 보여요.

- **구성**: 공지사항(없으면 "안녕하세요. {이름}입니다."), 인사말, 자주 묻는 질문
- **동작**: 질문 버튼을 누르면 저장된 답변이 바로 보여요. 서버 메시지가 아니라서 문의함·읽지 않음 수·알림에 영향이 없어요. 고객지원은 설정 전에도 서버 기본 문답 4개가 보여요.
- **한도**: 공지사항 100자(한 줄), 인사말 200자, 질문 최대 5개(질문 40자·답변 300자), 같은 질문 중복 금지. 화면(`useFormErrors`)과 서버가 모두 검사해요.
- **저장**: `chat_intro`(`scope_key` = `SUPPORT` 또는 `STORE:{가게ID}`, UNIQUE, notice, greeting) + `chat_intro_item`(질문·답변·sort_order). 저장은 항상 전체 교체예요.

| 메서드 | 경로 | 권한 |
|---|---|---|
| GET | `/api/chat/intro/support` | 로그인 |
| GET | `/api/chat/intro/stores/{storeId}` | 로그인 (삭제된 가게 404) |
| PUT | `/api/chat/intro/stores/{storeId}` | 그 가게의 사장님(사업자 역할 + 소유) |
| PUT | `/api/admin/chat/intro` | 관리자 |
| POST | `/api/admin/chat/intro/avatar` | 관리자 (고객지원 사진 업로드) |

### 채팅 관리

- 사업자 패널·관리자 패널의 `채팅 관리` 탭은 같은 `ChatIntroEditor`를 써요. 구성은 프로필 · 공지사항 · 인사말 · 자주 묻는 질문이에요.
- 사업자 패널은 가게별로 설정하고, 가게가 2개 이상이면 선택한 가게를 URL `chatIntroStore`에 남겨요. 모바일은 `설정 | 미리보기`를 전환해요.
- 인사말은 `{이름}`(손님 이름, 모르면 "회원")과 빈 줄 문단을 지원해요.
- 표시 이름(30자)·사진은 고객지원만 바꿀 수 있어요. 사진은 `POST /api/admin/chat/intro/avatar`로 올려요. 가게는 가게 이름·대표 사진을 그대로 써요.
- 미리보기(`ChatIntroPreview`)는 실제 대화창과 같은 `ChatIntro`를 그리고, 저장하면 `chatKeys.intro(scope)` 캐시를 갱신해 손님 메신저에 바로 반영돼요.

## PC 세션 알림

앱 안 unread 배지 외에 선택형 PC 알림이 있어요.

- 기본은 꺼져 있고, `PC 알림 켜기`를 눌렀을 때만 브라우저 권한을 요청해요.
- 열어 둔 대화의 증분 폴링으로만 동작하고, 화면이 보이고 focus가 있으면 알림을 띄우지 않아요.
- 알림 문구는 고정 익명 문구예요. 이름·가게명·메시지 내용은 넣지 않아요.
- 페이지가 닫혀 있을 때 오는 push는 없어요.

브라우저 권한 규칙은 [MDN Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)를 따라요.

## 첨부

일반 파일 첨부는 없어요. 사진만 암호화된 별도 경로로 보낼 수 있어요. [채팅 사진 키](chat-images.md)를 참고하세요.
