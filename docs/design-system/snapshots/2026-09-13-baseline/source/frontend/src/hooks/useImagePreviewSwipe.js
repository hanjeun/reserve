import { useEffect } from 'react';

/**
 * 이미지 프리뷰(AntD Image.PreviewGroup)에서 좌우 스와이프로 장 넘기기.
 *
 * ★ 왜 전역 훅인가 (2026-08-06 재작성)
 *   처음엔 `useImagePreview` 안에 넣었는데 **가게 상세에서 전혀 동작하지 않았다.**
 *   그 훅의 previewOpen/previewItems state 에 묶여 있었는데, 가게 상세의 캐러셀은
 *   그 훅을 쓰지 않고 `<Image.PreviewGroup>` 을 직접 쓴다(AntD 내부 state).
 *   즉 사용자가 실제로 스와이프해보는 화면에서는 핸들러가 켜지지도 않았다.
 *
 *   프리뷰를 여는 경로가 두 가지(훅 경유 / PreviewGroup 직접)라, 어느 한쪽 state 에
 *   의존하면 반드시 반쪽만 동작한다. → **DOM 을 단일 진실로 삼는다.**
 *   열려 있는 프리뷰가 있으면 무조건 붙고, 넘기기는 AntD 자신의 좌우 버튼을 눌러 위임한다.
 *   우리가 인덱스를 직접 계산하지 않으므로 두 경로 모두에서 같은 동작이 보장된다.
 *
 * ★ 좌우 버튼이 CSS 로 숨겨져 있어도(모바일) 동작한다
 *   `display: none` 인 요소도 `element.click()` 은 정상적으로 이벤트를 발생시킨다.
 *   버튼이 아예 렌더되지 않는 경우(사진 1장)는 querySelector 가 null 이라 조용히 무시된다.
 *
 * ★ pointer 이벤트를 쓰는 이유
 *   touchstart/touchend 로 짰을 때 잡히지 않았다. rc-image 가 자체 터치 핸들러에서
 *   이벤트를 소비하고, 브라우저 기기 에뮬레이션은 터치 합성 방식이 실기기와 다르다.
 *   pointer 는 터치·펜·마우스를 한 경로로 정규화하고, capture 단계에서 받으면
 *   rc-image 가 stopPropagation 을 해도 우리가 먼저 본다.
 *
 * 사용법: App.jsx 에서 한 번만 호출한다(전역 1회).
 */

const PREVIEW_ROOT = '.ant-image-preview';
// 가로 이동이 이 값 이상이어야 넘김으로 본다. 60px 은 뻑뻑해서 45 로 낮췄다.
const SWIPE_MIN_X = 45;
// 세로 이동 대비 이 배수 이상 가로로 움직여야 한다(대각선 드래그를 넘김으로 오해하지 않게).
const SWIPE_RATIO = 1.2;
// 이 배율을 넘으면 확대 상태로 본다 — 그때의 드래그는 넘김이 아니라 팬(이동)이다.
const ZOOM_THRESHOLD = 1.05;

const openPreview = () => {
    // 여러 개가 DOM 에 남아 있을 수 있다(닫힘 애니메이션 중). 화면에 보이는 것만 고른다.
    const roots = [...document.querySelectorAll(PREVIEW_ROOT)];
    return roots.find((el) => el.offsetParent !== null || getComputedStyle(el).display !== 'none') ?? null;
};

const isZoomed = (root) => {
    const img = root.querySelector('img');
    if (!img) return false;
    try {
        const m = new DOMMatrixReadOnly(getComputedStyle(img).transform);
        return m.a > ZOOM_THRESHOLD;
    } catch {
        return false;
    }
};

const useImagePreviewSwipe = () => {
    useEffect(() => {
        let startX = 0;
        let startY = 0;
        let root = null;

        const onDown = (e) => {
            root = null;
            // 마우스는 제외 — 데스크톱에는 좌우 버튼이 있고, 드래그는 팬에 쓰인다.
            if (e.pointerType === 'mouse' || !e.isPrimary) return;
            const el = openPreview();
            if (!el || !el.contains(e.target)) return;
            if (isZoomed(el)) return;
            root = el;
            startX = e.clientX;
            startY = e.clientY;
        };

        const onUp = (e) => {
            const el = root;
            root = null;
            if (!el) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.abs(dx) < SWIPE_MIN_X || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;

            // 왼쪽으로 밀면 다음 장. AntD 6/5 클래스명을 모두 시도한다.
            const next = dx < 0;
            const btn = el.querySelector(
                next
                    ? '.ant-image-preview-switch-next, .ant-image-preview-switch-right'
                    : '.ant-image-preview-switch-prev, .ant-image-preview-switch-left'
            );
            // disabled(첫 장에서 이전 / 마지막 장에서 다음)면 누르지 않는다 —
            // 눌러도 무시되지만, 명시적으로 걸러야 의도가 드러난다.
            if (btn && !btn.classList.contains('ant-image-preview-switch-disabled')) btn.click();
        };

        // passive: true — preventDefault 를 하지 않는다(핀치 줌·팬을 막으면 안 된다).
        const opts = { capture: true, passive: true };
        document.addEventListener('pointerdown', onDown, opts);
        document.addEventListener('pointerup', onUp, opts);
        document.addEventListener('pointercancel', onUp, opts);
        return () => {
            document.removeEventListener('pointerdown', onDown, opts);
            document.removeEventListener('pointerup', onUp, opts);
            document.removeEventListener('pointercancel', onUp, opts);
        };
    }, []);
};

export default useImagePreviewSwipe;
