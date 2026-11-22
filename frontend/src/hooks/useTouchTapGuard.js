import { useRef } from 'react';
import { PHOTO_TOUCH_SLOP } from '../utils/photoPreview';

const moved = (contact, touch) => !touch || touch.identifier !== contact.id
    || Math.hypot(touch.clientX - contact.x, touch.clientY - contact.y) > PHOTO_TOUCH_SLOP;

/** 스크롤을 브라우저에 맡기고 제스처 뒤의 클릭만 막아 키보드 실행을 보존한다. */
export default function useTouchTapGuard(holdMs = Infinity) {
    const contact = useRef(null);
    const cancel = () => { if (contact.current) contact.current.blocked = true; };
    return {
        onPointerDownCapture(event) {
            if (event.pointerType !== 'touch' && event.currentTarget.contains(event.target)) contact.current = null;
        },
        onPointerCancelCapture(event) {
            if (event.pointerType === 'touch') cancel();
        },
        onTouchStartCapture(event) {
            if (!event.currentTarget.contains(event.target)) return;
            const touch = event.touches[0];
            if (!touch) return;
            contact.current = { id: touch.identifier, x: touch.clientX, y: touch.clientY, started: event.timeStamp,
                blocked: event.touches.length !== 1 };
        },
        onTouchMoveCapture(event) {
            const start = contact.current;
            if (start) start.blocked ||= event.touches.length !== 1 || moved(start, event.touches[0]);
        },
        onTouchEndCapture(event) {
            const start = contact.current;
            if (start) start.blocked ||= event.touches.length !== 0 || moved(start, event.changedTouches[0])
                || event.timeStamp - start.started >= holdMs;
        },
        onTouchCancelCapture: cancel,
        onClickCapture(event) {
            if (event.detail === 0 || !event.currentTarget.contains(event.target)) return;
            if (contact.current?.blocked) {
                event.preventDefault();
                event.stopPropagation();
            }
            contact.current = null;
        },
    };
}
