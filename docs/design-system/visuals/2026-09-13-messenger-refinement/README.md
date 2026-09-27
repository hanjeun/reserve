# 메신저 하단 구조 시각 확인

2026-09-13 로컬 프리뷰. 실제 시각 컴포넌트와 현재 CSS를 사용하는 **예시 데이터 fixture** 캡처다.
실제 로그인·채팅 API·전송·알림 권한을 호출하지 않는다. 계정 이름/이메일·대화 내용은 예시이며
운영 대화의 스크린샷이 아니다. 모바일 상단은64px 공통 헤더 시각 대역이다.
PC 설정에서도 알림 control을 주입하지 않으므로 알림 설정 실제 동작을 이 캡처로 증명하지 않는다.

미리보기 소스: [HTML](../../../../frontend/design-previews/messenger-refinement.html),
[JSX](../../../../frontend/design-previews/messenger-refinement.jsx).
소스의 예시 표시는 캡처 바깥/입력 비활성으로 구분했다. 실제 UI 변경과 테스트 경계는
[정리 기록](../../../technical/history/2026-09-preview/messenger-home-refinement-2026-09-13.md)이다.

| 캡처 | 상태 |
|---|---|
| [PC 홈](messenger-home-pc.png) | 관리자 문의 카드, 최근 실제 형식 예시2건, 내부 하단 메뉴 |
| [PC 대화](messenger-conversations-pc.png) | 서로 다른 상대3건 예시, 방별 unread, 관리자 문의 |
| [PC 설정](messenger-settings-pc.png) | 계정·안내를 홈에서 설정으로 이동 |
| [PC 다크 설정](messenger-settings-dark-pc.png) | 기존 다크 토큰, 활성 하단 메뉴 |
| [모바일 홈](messenger-home-mobile.png) | 중복 내부 RESERVE 브랜드 없음 |
| [모바일 대화](messenger-conversations-mobile.png) | 독립 목록과 고정 하단 메뉴 |
| [모바일 설정](messenger-settings-mobile.png) | 실제 기능 범위의 계정/초안 안내 형식 |
| [모바일 선택 대화](messenger-thread-mobile.png) | 하단 메뉴 대신 대화·비활성 입력 fixture |

PC DOM 뷰포트1440×900, 패널420×620px이다. PC PNG는 Windows/인앱 캡처 배율을 반영한
native renderer 캡처이며565×815px의 패널 주변 crop이다. PNG 픽셀에서 CSS 크기를 역산하지 않는다.
모바일은390×844px PNG다. 320×568의 추가 DOM 검사에서도 가로 넘침0px, 메뉴 버튼54px을 확인했다.
스크린샷은 컴퓨터 사용 도구의 지원 CDP renderer capture로 저장했으며 이미지 편집/재구성은 하지 않았다.
임시 뷰포트와 device metrics를 복원했고 이 작업에서 만든 브라우저 탭은 닫았다.

이 캡처는 별도 시각 기준선이며 기존 `snapshots/2026-09-13-baseline`의108개 소스 ZIP을 변경하지 않는다.
