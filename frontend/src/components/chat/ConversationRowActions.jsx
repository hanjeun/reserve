import { useEffect, useId, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { EyeInvisibleOutlined, EyeOutlined, LogoutOutlined, MoreOutlined } from '../common/icons';
import IconTool from '../common/IconTool';
import Button from '../common/Button';
import Tooltip from '../common/Tooltip';
import { useMessage } from '../../hooks';

const ACTION_WIDTH = 96;
const REVEAL_DISTANCE = 32;
const DRAG_OFFSET = '--reserve-messenger-row-drag-offset';

export default function ConversationRowActions({ children, title, hidden = false, onVisibilityChange, onLeave }) {
    const [side, setSide] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [pending, setPending] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const root = useRef(null);
    const gesture = useRef(null);
    const suppressClick = useRef(false);
    const busy = useRef(false);
    const confirmation = useRef(null);
    const mounted = useRef(true);
    const actionId = useId();
    const { confirm, message } = useMessage();
    const visibilityLabel = hidden ? '복원' : '숨기기';
    const visibilityIcon = hidden ? <EyeOutlined aria-hidden="true" /> : <EyeInvisibleOutlined aria-hidden="true" />;
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            confirmation.current?.destroy();
        };
    }, []);
    useEffect(() => {
        if (!side) return undefined;
        const closeOutside = event => {
            if (!root.current?.contains(event.target)) setSide(0);
        };
        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [side]);

    const endGesture = cancelled => {
        const start = gesture.current;
        if (!start) return;
        gesture.current = null;
        if (start.axis === 'x') {
            root.current?.style.removeProperty(DRAG_OFFSET);
            setDragging(false);
            const direction = cancelled ? 0 : Math.sign(start.offset);
            const fullDistance = Math.max(116, start.width * 0.6);
            if (direction && Math.abs(start.offset) >= fullDistance
                && (start.offset - start.origin) * direction >= fullDistance) {
                setSide(0);
                confirmAction(direction > 0 ? 'leave' : 'visibility');
            } else {
                setSide(Math.abs(start.offset) >= REVEAL_DISTANCE ? direction : 0);
            }
        }
        if (root.current?.hasPointerCapture?.(start.id)) root.current.releasePointerCapture(start.id);
    };
    const pointerDown = event => {
        if (event.isPrimary !== false && !gesture.current) suppressClick.current = false;
        if (busy.current || confirmation.current || event.button > 0) return;
        if (event.isPrimary === false || gesture.current) {
            endGesture(true);
            setSide(0);
            return;
        }
        if (event.target.closest('.reserve-messenger-row')) {
            const offset = side * ACTION_WIDTH;
            const width = root.current?.clientWidth || ACTION_WIDTH;
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, axis: null, origin: offset, offset, width };
        }
    };
    const pointerMove = event => {
        const start = gesture.current;
        if (!start || start.id !== event.pointerId) return;
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        if (!start.axis && Math.max(Math.abs(dx), Math.abs(dy)) > 10) {
            start.axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
            if (start.axis === 'x') {
                if (event.pointerType !== 'touch') root.current?.setPointerCapture?.(event.pointerId);
                setDragging(true);
            }
        }
        if (start.axis !== 'x') return;
        suppressClick.current = true;
        if (event.pointerType !== 'touch') event.preventDefault();
        start.offset = Math.min(onLeave ? start.width : 0, Math.max(-start.width, start.origin + dx));
        root.current?.style.setProperty(DRAG_OFFSET, `${start.offset}px`);
        setSide(Math.sign(start.offset));
    };
    const pointerEnd = event => {
        if (gesture.current?.id === event.pointerId) endGesture(false);
    };
    const pointerCancel = event => {
        if (gesture.current?.id === event.pointerId) endGesture(true);
    };
    const runAction = async action => {
        if (busy.current || !mounted.current) return;
        busy.current = true;
        setPending(true);
        const returnFocus = root.current?.closest('.reserve-messenger')?.querySelector('.reserve-messenger-list-heading [aria-pressed]');
        try {
            if (action === 'leave') await onLeave();
            else await onVisibilityChange(!hidden);
            if (mounted.current) setSide(0);
            if (returnFocus?.isConnected && (document.activeElement === document.body || root.current?.contains(document.activeElement))) returnFocus.focus();
        } catch {
            if (mounted.current) message.error(action === 'leave' ? '채팅방에서 나가지 못했어요. 다시 시도해주세요.'
                : '대화 표시를 변경하지 못했어요. 다시 시도해주세요.');
        } finally {
            busy.current = false;
            if (mounted.current) setPending(false);
        }
    };
    const confirmAction = action => {
        if (confirmation.current || busy.current) return;
        const leaving = action === 'leave';
        confirmation.current = confirm({
            title: leaving ? '채팅방에서 나갈까요?' : hidden ? '대화를 목록에 복원할까요?' : '대화를 목록에서 숨길까요?',
            content: leaving ? '내 대화와 숨긴 대화 목록에서 사라져요. 새 메시지가 오면 이전 대화와 함께 다시 표시돼요.'
                : hidden ? '대화 목록에서 다시 볼 수 있어요.' : '숨긴 대화에서 다시 볼 수 있어요.',
            okText: leaving ? '나가기' : visibilityLabel,
            okButtonProps: leaving ? { danger: true } : undefined,
            onOk: () => runAction(action),
            afterClose: () => { confirmation.current = null; },
        });
    };
    const actionVisible = Boolean(side) && !dragging;
    const visibilityVisible = actionVisible && side < 0;
    const leaveVisible = actionVisible && side > 0;
    const menuLabel = `${title} 대화 메뉴`;
    return <div ref={root} className="reserve-messenger-row-actions" data-discovery-swipe-ignore="true"
        style={{ '--reserve-messenger-row-action-width': `${ACTION_WIDTH}px` }}
        data-dragging={dragging || undefined}
        data-reveal={side < 0 ? 'left' : side > 0 ? 'right' : undefined}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerEnd} onPointerCancel={pointerCancel}
        onLostPointerCapture={event => {
            // 터치 대상의 포인터를 행으로 옮길 때 첫 대상에서도 캡처 해제가 발생한다.
            if (event.target === event.currentTarget) pointerCancel(event);
        }}
        onPointerLeave={event => {
            if (event.pointerType === 'mouse' && gesture.current?.axis !== 'x') pointerCancel(event);
        }}
        onDragStart={event => {
            if (gesture.current) event.preventDefault();
        }}
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
        <div id={actionId} className="reserve-messenger-row-swipe-action reserve-messenger-row-visibility"
            inert={!visibilityVisible || undefined} aria-hidden={!visibilityVisible}>
            <Button variant="ghost-sm" size="sm" loading={pending} onClick={() => runAction('visibility')}
                aria-label={`${title} ${visibilityLabel}`}>
                {visibilityIcon}{visibilityLabel}
            </Button>
        </div>
        {onLeave && <div className="reserve-messenger-row-swipe-action reserve-messenger-row-leave"
            inert={!leaveVisible || undefined} aria-hidden={!leaveVisible}>
            <Button variant="ghost-sm-danger" size="sm" loading={pending} onClick={() => confirmAction('leave')}
                aria-label={`${title} 채팅방 나가기`}>
                <LogoutOutlined aria-hidden="true" />나가기
            </Button>
        </div>}
        <div className="reserve-messenger-row-front">
            {children}
            <span className="reserve-messenger-row-menu">
                {onLeave ? <Dropdown trigger={['click']} placement="bottomRight" open={menuOpen} autoFocus
                    onOpenChange={open => {
                        setMenuOpen(open);
                        if (open) setSide(0);
                    }}
                    menu={{ items: [
                        { key: 'visibility', icon: visibilityIcon, label: visibilityLabel },
                        { key: 'leave', icon: <LogoutOutlined aria-hidden="true" />, label: '채팅방 나가기', danger: true },
                    ], onClick: ({ key }) => {
                        setMenuOpen(false);
                        if (key === 'leave') confirmAction('leave');
                        else void runAction('visibility');
                    } }}>
                    <Tooltip title={menuLabel} disabled={menuOpen}>
                        <button type="button" className="reserve-icon-tool" aria-label={menuLabel} aria-haspopup="menu"
                            aria-expanded={menuOpen} disabled={pending}><MoreOutlined /></button>
                    </Tooltip>
                </Dropdown> : <IconTool label={menuLabel} icon={<MoreOutlined />} disabled={pending}
                    expanded={actionVisible} controls={actionId} onClick={() => setSide(value => value ? 0 : -1)} />}
            </span>
        </div>
    </div>;
}

ConversationRowActions.propTypes = {
    children: PropTypes.node.isRequired, title: PropTypes.string.isRequired,
    hidden: PropTypes.bool, onVisibilityChange: PropTypes.func.isRequired, onLeave: PropTypes.func,
};
