# 2026-09-14 레이아웃 회귀 캡처

현재 미커밋 프리뷰의 시각 확인 자료다. 실측과 검사 범위는
[보정 기록](../../../technical/history/2026-09-preview/layout-regressions-2026-09-14.md)에 있다.

| 파일 | CSS 뷰포트 | 표면/조건 |
|---|---|---|
| [mobile-home-banner.png](mobile-home-banner.png) |390×844 |실제 비로그인 홈, 원본 비율/번호 유지 |
| [mobile-policy-form.png](mobile-policy-form.png) |390×844 |실제 StoreForm 수정 모드, 환불·마감 위치로 스크롤, 라이트 |
| [mobile-confirm.png](mobile-confirm.png) |390×844 |실제 useMessage.confirm, 표준 탈퇴 문구, 라이트 |
| [mobile-dark-confirm.png](mobile-dark-confirm.png) |390×844 |동일 확인창, 다크 표본 provider |
| [mobile-long-confirm-320.png](mobile-long-confirm-320.png) |320×480 |본문15회 반복으로 높이 제한/본문 스크롤/버튼 행 확인 |
| [pc-confirm.png](pc-confirm.png) |1440×900 |표준 확인창 PC 중앙 배치 |

폼·모달은 [개발 전용 fixture](../../../../frontend/design-previews/visual-regressions.html)에서
실제 공통 컴포넌트와 `index.css`를 렌더했다. 예시 값, 64px 헤더 표본, 검증용 ConfigProvider를
사용한다. 실제 인증된 MyPage/가게 수정 페이지 전체의 E2E 결과가 아니다.
`?mode=create`의 실제 등록 기본값도320px에서 확인했지만 별도 캡처는 보관하지 않았다.

모든 저장·임시저장·탈퇴 콜백은 무해한 함수다. 주소 입력·파일 업로드·실제 저장·탈퇴·알림·위치 권한은
수행하지 않았다. 실제 앱의 자동 임시저장 안내 문구는 컴포넌트에 남아 있지만 fixture에는 그 저장 훅이 없다.

Codex in-app browser의 네이티브125% 표시 때문에 캡처 scale1.25를 사용했다.
PNG 픽셀 크기는488×1055(390×844), 400×600(320×480), 1800×1125(1440×900)다.
레이아웃 판단은 PNG 픽셀 수가 아니라 DOM의 CSS px 실측을 기준으로 한다. 스크롤된 폼은 문서의
현재 scrollY 위치에서 뷰포트만 캡처했으며, 이미지를 편집하거나 외부 사진으로 대체하지 않았다.

기존 [108개 소스 동결 기준선](../../snapshots/2026-09-13-baseline/README.md)은 변경하지 않았다.
