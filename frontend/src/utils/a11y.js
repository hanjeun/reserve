/**
 * 접근성(a11y) 유틸
 *
 * div, li처럼 원래 클릭 대상이 아닌 요소에 onClick만 달면 마우스로만 쓸 수 있다 —
 * 키보드 사용자(Tab으로 포커스 → Enter/Space)와 스크린리더 사용자는 그 동작에 닿지 못한다.
 * 가능하면 <button>을 쓰는 게 정석이지만, 이미 레이아웃이 잡힌 컨테이너를 통째로 버튼으로 바꾸면
 * 스타일이 깨지는 곳들이 있어서 그런 경우엔 role="button" + tabIndex={0} + 이 핸들러를 함께 단다.
 * (SonarCloud "Avoid non-native interactive elements" 대응 — 광고 배너/예약 행/내 가게 카드)
 *
 * 사용법:
 *   <div role="button" tabIndex={0} onClick={go} onKeyDown={onActivateKey(go)}>
 */
export const onActivateKey = (handler) => (e) => {
    // Enter와 Space만 "활성화"로 취급 — 네이티브 <button>의 동작과 동일하게 맞춘다.
    if (e.key !== 'Enter' && e.key !== ' ') return;
    // Space는 기본 동작이 스크롤이라 막아야 하고, Enter는 폼 안에서 submit이 될 수 있어 함께 막는다.
    e.preventDefault();
    handler(e);
};
