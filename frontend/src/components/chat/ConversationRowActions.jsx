import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { EyeInvisibleOutlined, EyeOutlined, MoreOutlined } from '../common/icons';
import IconTool from '../common/IconTool';
import Button from '../common/Button';
import { useMessage } from '../../hooks';

export default function ConversationRowActions({ children, title, hidden = false, onVisibilityChange }) {
    const [side, setSide] = useState(0);
    const [pending, setPending] = useState(false);
    const root = useRef(null);
    const gesture = useRef(null);
    const suppressClick = useRef(false);
    const busy = useRef(false);
    const mounted = useRef(true);
    const actionId = useId();
    const { message } = useMessage();
    useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
    }, []);
    useEffect(() => {
        if (!side) return undefined;
        const closeOutside = event => {
            if (!root.current?.contains(event.target)) setSide(0);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [side]);

    const pointerDown = event => {
        suppressClick.current = false;
        if (event.pointerType === 'mouse' || busy.current) return;
        if (event.isPrimary === false || gesture.current) {
            gesture.current = null;
            setSide(0);
            return;
        }
        if (event.target.closest('.reserve-messenger-row')) {
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null };
        }
    };
    const pointerMove = event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
            start.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
            if (start.axis === 'x') root.current?.setPointerCapture?.(event.pointerId);
        }
        if (start.axis !== 'x') return;
        suppressClick.current = true;
        event.preventDefault();
        setSide(Math.abs(dx) >= 32 ? Math.sign(dx) : 0);
    };
    const pointerEnd = event => {
        if (gesture.current?.id !== event.pointerId) return;
        gesture.current = null;
        if (root.current?.hasPointerCapture?.(event.pointerId)) root.current.releasePointerCapture(event.pointerId);
    };
    const pointerCancel = event => {
        pointerEnd(event);
        setSide(0);
    };
    const changeVisibility = async () => {
        if (busy.current) return;
        busy.current = true;
        setPending(true);
        const returnFocus = root.current?.closest('.reserve-messenger')?.querySelector('.reserve-messenger-list-heading [aria-pressed]');
        try {
            await onVisibilityChange(!hidden);
            if (mounted.current) setSide(0);
            if (returnFocus?.isConnected && (document.activeElement === document.body || root.current?.contains(document.activeElement))) returnFocus.focus();
        } catch {
            if (mounted.current) message.error('대화 표시를 변경하지 못했어요. 다시 시도해주세요.');
        } finally {
            busy.current = false;
            if (mounted.current) setPending(false);
        }
    };
    return <div ref={root} className="reserve-messenger-row-actions" data-discovery-swipe-ignore="true"
        data-reveal={side < 0 ? 'left' : side > 0 ? 'right' : undefined}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerCancel}
        onClickCapture={event => {
            if (suppressClick.current && event.detail !== 0) {
                suppressClick.current = false;
                event.preventDefault();
                event.stopPropagation();
            }
        }}
        onKeyDown={event => {
            if (event.key !== 'Escape' || !side) return;
            event.preventDefault();
            event.stopPropagation();
            setSide(0);
            root.current?.querySelector('.reserve-messenger-row-menu button')?.focus();
        }}
        onBlur={event => {
            if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setSide(0);
        }}>
        <div id={actionId} className="reserve-messenger-row-visibility" inert={!side ? true : undefined} aria-hidden={!side}>
            <Button variant="ghost-sm" size="sm" loading={pending} onClick={changeVisibility}
                aria-label={`${title} ${hidden ? '복원' : '숨기기'}`}>
                {hidden ? <EyeOutlined /> : <EyeInvisibleOutlined />}{hidden ? '복원' : '숨기기'}
            </Button>
        </div>
        <div className="reserve-messenger-row-front">
            {children}
            <span className="reserve-messenger-row-menu">
                <IconTool label={`${title} 대화 메뉴`} icon={<MoreOutlined />} disabled={pending}
                    expanded={Boolean(side)} controls={actionId} onClick={() => setSide(value => value ? 0 : -1)} />
            </span>
        </div>
    </div>;
}

ConversationRowActions.propTypes = {
    children: PropTypes.node.isRequired, title: PropTypes.string.isRequired,
    hidden: PropTypes.bool, onVisibilityChange: PropTypes.func.isRequired,
};
