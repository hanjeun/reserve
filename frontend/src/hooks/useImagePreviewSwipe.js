import { useEffect } from 'react';

/*
 * 열린 AntD 미리보기의 탐색 버튼으로 좌우 넘김을 위임한다. 확대 중 드래그는 사진 이동으로 남기고 사진이 한 장이면 넘기지 않는다.
 */

const PREVIEW_ROOT = '.ant-image-preview';
// 가로 이동이 이 값 이상이어야 넘김으로 본다. 60px 은 뻑뻑해서 45 로 낮췄다.
const SWIPE_MIN_X = 45;
// 세로 이동 대비 이 배수 이상 가로로 움직여야 한다(대각선 드래그를 넘김으로 오해하지 않게).
const SWIPE_RATIO = 1.2;
// 이 배율을 넘으면 확대 상태로 본다 — 그때의 드래그는 넘김이 아니라 팬(이동)이다.
const ZOOM_THRESHOLD = 1.05;

const isZoomed = (root, view) => {
    const img = root.querySelector('img');
    if (!img) return false;
    try {
        const m = new view.DOMMatrixReadOnly(view.getComputedStyle(img).transform);
        return m.a > ZOOM_THRESHOLD;
    } catch {
        return false;
    }
};

export function stepImagePreview(root, forward) {
    const direction = forward ? 'next' : 'prev';
    root.querySelector(`.ant-image-preview-switch-${direction}`)?.click();
}

const useImagePreviewSwipe = (ownerDocument = globalThis.document) => {
    useEffect(() => {
        const view = ownerDocument?.defaultView;
        if (!view) return undefined;
        let startX = 0;
        let startY = 0;
        let root = null;

        const onDown = (e) => {
            root = null;
            // 마우스는 제외 — 데스크톱에는 좌우 버튼이 있고, 드래그는 팬에 쓰인다.
            if (e.pointerType === 'mouse' || !e.isPrimary) return;
            const el = e.target.closest?.(PREVIEW_ROOT);
            if (!el || isZoomed(el, view)) return;
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

            stepImagePreview(el, dx < 0);
        };

        // passive: true — preventDefault 를 하지 않는다(핀치 줌·팬을 막으면 안 된다).
        const controller = new view.AbortController();
        const opts = { capture: true, passive: true, signal: controller.signal };
        ownerDocument.addEventListener('pointerdown', onDown, opts);
        ownerDocument.addEventListener('pointerup', onUp, opts);
        ownerDocument.addEventListener('pointercancel', onUp, opts);
        return () => controller.abort();
    }, [ownerDocument]);
};

export default useImagePreviewSwipe;
