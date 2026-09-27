# 메신저 런처 시각 확인

2026-09-13 로컬 개발용 미리보기에서 실제 `MessengerLauncherVisual`과 `src/index.css`를 사용했다.
인증 store·대화/광고 API를 가져오지 않는다. 로그인된 실제 패널·운영 광고 동작의 E2E 증거가 아니다.

- PC 원본 viewport 1280×720, 네이티브 clip x150/y0/w980/h460: [launcher.png](launcher.png).
- 모바일 viewport 390×844, viewport 캡처: [launcher-mobile.png](launcher-mobile.png).
- 원본 버튼 실측: PC 56×56/radius16px, 모바일 48×48/radius14px.
- 모든 예시에서 배경 rgb(255,255,255), 기본 블루 전경 라이트 rgb(34,114,235)·다크 rgb(49,130,246).
- 메시지/X, 자체 `/icons/R_logo.png` 이미지 로드, 없는 로컬 이미지의 아이콘 복귀를 확인했다.
- 두 viewport 모두 가로 넘침 없음. 모바일 캡처는 첫 viewport만 담으며 아래쪽 다크 예시는 PC 캡처와 DOM 측정으로 확인했다.
- 확인 후 임시 viewport를 원복했다. 사용자 로그인/설정/대화 상태를 조작하지 않았다.

개발 서버에서 [스타일 미리보기](http://localhost:5173/design-previews/messenger-launcher.html)를 열 수 있다.
소스: [HTML](../../../../frontend/design-previews/messenger-launcher.html),
[JSX](../../../../frontend/design-previews/messenger-launcher.jsx).
App의 페이지 라우트나 Vite 프로덕션 빌드 entry로 등록하지 않은 개발 전용 파일이다.

선택형 사진은 `MessengerShell.launcherImageSrc`로 연결한다. App의 기본 버튼은 여전히 메시지 아이콘이다.
관리자 사진 업로드/영구 설정 저장 기능을 추가한 것은 아니다.
광고 UI·저장소 후속 제안은 [검토 문서](../../../technical/history/2026-09-preview/channel-style-advertising-and-storage-review-2026-09-13.md)를 본다.
