import { useEffect } from 'react';
import { isHorizontalPhotoSwipe } from '../utils/photoPreview';

/*
 * 열린 AntD 미리보기의 탐색 버튼으로 좌우 넘김을 위임한다. 확대 중 드래그는 사진 이동으로 남기고 사진이 한 장이면 넘기지 않는다.
 */

const PREVIEW_ROOT = '.ant-image-preview';
// 이 배율을 넘으면 확대 상태로 본다 — 그때의 드래그는 넘김이 아니라 팬(이동)이다.
const ZOOM_THRESHOLD = 1.05;

const isZoomed = (root, view) => {
    const img = root.querySelector('img');
    if (!img) return false;
    try {
        const m = new view.DOMMatrixReadOnly(view.getComputedStyle(img).transform);
        return Math.hypot(m.a, m.b) > ZOOM_THRESHOLD;
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
        let start = null;

        const onDown = (e) => {
            start = null;
            if (!e.isPrimary || e.button !== 0 || !e.target.matches?.('img')) return;
            const el = e.target.closest?.(PREVIEW_ROOT);
            if (!el || isZoomed(el, view)) return;
            start = { root: el, pointerId: e.pointerId, x: e.clientX, y: e.clientY };
        };

        const onUp = (e) => {
            if (!start || start.pointerId !== e.pointerId) return;
            const { root, x, y } = start;
            start = null;
            if (e.type === 'pointercancel' || isZoomed(root, view)) return;
            const dx = e.clientX - x;
            if (isHorizontalPhotoSwipe(dx, e.clientY - y)) stepImagePreview(root, dx < 0);
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
