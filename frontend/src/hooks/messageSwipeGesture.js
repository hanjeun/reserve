const dragOffset = '--reserve-message-drag-y';
const interactive = 'a, button, input, select, textarea, [contenteditable], [role="button"], [role="link"]';

export default function withSwipe(config) {
    if (config.closable === false || config.closable?.disabled) return config;
    const props = config.props;
    let drag;
    let closed = false;
    let suppressClick = false;

    const finish = closing => {
        if (!drag) return;
        const { node, pointerId } = drag;
        drag = undefined;
        node.removeAttribute('data-message-dragging');
        if (!closing) node.style.removeProperty(dragOffset);
        if (node.hasPointerCapture?.(pointerId)) node.releasePointerCapture(pointerId);
    };
    const cancel = event => {
        if (event.pointerId === drag?.pointerId) finish(false);
    };

    return {
        ...config,
        className: config.className ? config.className + ' reserve-swipe-message' : 'reserve-swipe-message',
        closable: config.closable ?? { 'aria-label': '알림 닫기' },
        pauseOnHover: false,
        props: {
            ...props,
            onPointerDown(event) {
                props?.onPointerDown?.(event);
                if (closed || drag || event.defaultPrevented || event.button !== 0 || event.isPrimary === false) return;
                suppressClick = false;
                if (event.target.closest(interactive)) return;
                const { currentTarget: node, pointerId, clientY, timeStamp } = event;
                drag = { node, pointerId, clientY, timeStamp };
                node.setPointerCapture?.(pointerId);
            },
            onPointerMove(event) {
                props?.onPointerMove?.(event);
                if (!drag || event.pointerId !== drag.pointerId) return;
                const offset = event.clientY - drag.clientY;
                if (!suppressClick && Math.abs(offset) < 5) return;
                suppressClick = true;
                drag.node.setAttribute('data-message-dragging', '');
                drag.node.style.setProperty(dragOffset, offset + 'px');
            },
            onPointerUp(event) {
                props?.onPointerUp?.(event);
                if (!drag || event.pointerId !== drag.pointerId) return;
                const distance = drag.clientY - event.clientY;
                const speed = distance / Math.max(1, event.timeStamp - drag.timeStamp);
                const threshold = Math.min(40, Math.max(6, drag.clientY * 0.6));
                const dismiss = distance >= threshold || distance >= 12 && speed >= 0.45;
                if (dismiss) {
                    suppressClick = true;
                    // 내장 닫기를 사용해 완료 콜백과 알림 반환값의 수명을 보존한다.
                    drag.node.querySelector('.ant-message-notice-close')?.click();
                }
                finish(closed);
            },
            onPointerCancel(event) { props?.onPointerCancel?.(event); cancel(event); },
            onLostPointerCapture(event) { props?.onLostPointerCapture?.(event); cancel(event); },
            onClickCapture(event) {
                if (suppressClick && event.detail !== 0) {
                    event.preventDefault();
                    event.stopPropagation();
                    suppressClick = false;
                    return;
                }
                props?.onClickCapture?.(event);
            },
        },
        onClose() {
            closed = true;
            finish(true);
            config.onClose?.();
        },
    };
}
