import { useEffect } from 'react';

/**
 * 열린 AntD 이미지 프리뷰의 좌우 스와이프를 공용으로 처리한다. App에서 한 번만 등록한다.
 * 훅 기반·직접 PreviewGroup 경로를 모두 지원하도록 열린 DOM을 찾고 AntD 탐색 버튼에 넘김을 위임한다.
 * capture 단계의 pointer 이벤트를 사용하며 확대 상태의 드래그는 사진 이동으로 남겨둔다.
 * 사진이 한 장이라 탐색 버튼이 없으면 넘김을 수행하지 않는다.
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
            if (!el?.contains(e.target)) return;
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
