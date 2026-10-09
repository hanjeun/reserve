import React, { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Badge } from 'antd';
import { CloseOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { chatService } from '../../services';
import { chatKeys } from '../../hooks/queryKeys';
import { useWindowWidth } from '../../hooks';
import useMessagesEntry from '../../hooks/useMessagesEntry';
import useAuthStore from '../../store/useAuthStore';
import useMessengerStore, { messengerIdentityOf } from '../../store/useMessengerStore';
import { breakpoints } from '../../styles/tokens';
import MessengerLauncherVisual from './MessengerLauncherVisual';
import { chatListQueryPolicy, shouldAutoRefreshChatMetadata } from './chatListQueryPolicy';
import ConversationListSkeleton from './ConversationListSkeleton';
import { LoadingPresentationContext, createLoadingPresentation } from '../layout/loadingPresentation';

const MessengerContent = lazy(() => import('./MessengerContent'));
const BADGE_POLL_MS = 60000;

// 패널을 실제로 연 한 번의 이동만 기록한다. 뒤쪽 페이지와 골격 표시 기록을 공유하지 않는다.
function MessengerPanelBody({ coverImageSrc }) {
    const identity = useMessengerStore(state => state.sessionIdentity);
    const view = useMessengerStore(state => state.view);
    const activeThread = useMessengerStore(state => state.activeThread);
    const selection = useMessengerStore(state => state.selection);
    const navigationKey = `${identity}:${view}:${activeThread}:${selection.kind}:${selection.storeId ?? selection.roomId ?? ''}`;
    const presentation = useMemo(() => createLoadingPresentation(navigationKey), [navigationKey]);
    return <LoadingPresentationContext.Provider value={presentation}>
        <Suspense fallback={<div className="reserve-messenger-shell-loading"><div style={{ width: '100%', padding: 24 }}><ConversationListSkeleton /></div></div>}>
            <MessengerContent surface="panel" coverImageSrc={coverImageSrc} />
        </Suspense>
    </LoadingPresentationContext.Provider>;
}
MessengerPanelBody.propTypes = { coverImageSrc: PropTypes.string };

/** 로그인 영역 전체의 단일 런처. PC는 패널, 모바일은 /messages 화면으로 진입한다. */
const MessengerShell = ({ launcherImageSrc = null, coverImageSrc }) => {
    const { pathname } = useLocation();
    const { openMessages } = useMessagesEntry();
    const width = useWindowWidth();
    const user = useAuthStore((state) => state.user);
    const sessionRevision = useAuthStore((state) => state.sessionRevision);
    const open = useMessengerStore((state) => state.open);
    const storeOpenRevision = useMessengerStore((state) => state.storeOpenRevision);
    const closePanel = useMessengerStore((state) => state.closePanel);
    const syncIdentity = useMessengerStore((state) => state.syncIdentity);
    const view = useMessengerStore((state) => state.view);
    const identity = messengerIdentityOf({ user, sessionRevision });
    const isMobile = width < breakpoints.tablet;
    const isMessagesPage = /^\/messages\/?$/.test(pathname);
    const panelRef = useRef(null);
    const launcherRef = useRef(null);
    const returnFocusRef = useRef(null);
    const previousOpenRef = useRef(false);
    const previousStoreOpenRevisionRef = useRef(storeOpenRevision);

    useEffect(() => { syncIdentity(identity); }, [identity, syncIdentity]);

    const { data: unread = 0 } = useQuery({
        queryKey: chatKeys.unread(),
        queryFn: chatService.getUnread,
        enabled: Boolean(user) && !isMessagesPage,
        ...chatListQueryPolicy,
        refetchInterval: query => ((!isMobile && open) || isMessagesPage || !shouldAutoRefreshChatMetadata(query))
            ? false : BADGE_POLL_MS,
    });
    const unreadCount = Number.isFinite(Number(unread)) ? Math.max(0, Math.trunc(Number(unread))) : 0;
    const messagesLabel = unreadCount > 0
        ? `메시지, 읽지 않은 메시지 ${unreadCount}개`
        : '메시지';

    // 닫힘 애니메이션 동안만 DOM을 유지한다. 외부(가게 상세)에서 open이 켜지는 경우도 받는다.
    const [panelState, setPanelState] = useState(() => ({ open, visible: open }));
    if (open !== panelState.open) {
        setPanelState({ open, visible: open || panelState.visible });
    }
    useLayoutEffect(() => {
        const previousRevision = previousStoreOpenRevisionRef.current;
        previousStoreOpenRevisionRef.current = storeOpenRevision;
        if (storeOpenRevision === previousRevision || !open || isMobile || isMessagesPage) return;
        // 이미 열린 패널의 가게 문의도 기존 CSS 모션만 다시 재생한다. 대화 DOM·초안은 유지한다.
        for (const animation of panelRef.current?.getAnimations?.() ?? []) {
            if ('animationName' in animation && animation.animationName === 'reserve-chat-in') {
                animation.currentTime = 0;
                animation.play();
            }
        }
    }, [open, storeOpenRevision, isMobile, isMessagesPage]);
    const handleAnimationEnd = (event) => {
        if (event.target === event.currentTarget && !open) {
            setPanelState({ open: false, visible: false });
            const target = returnFocusRef.current;
            if (target?.isConnected) target.focus();
            else launcherRef.current?.focus();
        }
    };
    // 브라우저가 animationend를 생략하는 예외(탭 전환·스타일 재계산)에도 닫힌 DOM이 남지 않게 한다.
    useEffect(() => {
        if (open || !panelState.visible) return undefined;
        const timer = setTimeout(() => {
            setPanelState({ open: false, visible: false });
            const target = returnFocusRef.current;
            if (target?.isConnected) target.focus();
            else launcherRef.current?.focus();
        }, 360);
        return () => clearTimeout(timer);
    }, [open, panelState.visible]);
    useEffect(() => {
        const wasOpen = previousOpenRef.current;
        previousOpenRef.current = open;
        if (!open || wasOpen || isMobile || isMessagesPage) return undefined;
        returnFocusRef.current = document.activeElement;
        const frame = requestAnimationFrame(() => {
            panelRef.current?.querySelector('textarea, button, [href]')?.focus();
        });
        return () => cancelAnimationFrame(frame);
    }, [open, isMobile, isMessagesPage]);

    const keepFocusInside = (event) => {
        // 사진/신고 등 React 포털의 키 입력은 뒤쪽 패널을 닫거나 포커스를 가두지 않는다.
        if (!event.currentTarget.contains(event.target)) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            closePanel();
            return;
        }
        if (event.key !== 'Tab') return;
        const focusable = [...(panelRef.current?.querySelectorAll(
            'button:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])') ?? [])]
            .filter((element) => !element.hasAttribute('hidden'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    };

    if (!user || /^\/search\/?$/.test(pathname)) return null;

    if (isMessagesPage) return null;

    return (
        <>
            {!isMobile && panelState.visible && (
                <div
                    ref={panelRef}
                    className={`reserve-messenger-panel-shell reserve-chat-panel${view === 'home' ? ' is-home' : ''}${open ? '' : ' is-closing'}`}
                    onAnimationEnd={handleAnimationEnd}
                    onKeyDown={keepFocusInside}
                    role="dialog"
                    aria-modal="false"
                    aria-label="메시지"
                >
                    <button
                        type="button"
                        className="reserve-chat-close reserve-messenger-shell-close"
                        onClick={closePanel}
                        aria-label="메시지 닫기"
                    >
                        <CloseOutlined />
                    </button>
                    <MessengerPanelBody coverImageSrc={coverImageSrc} />
                </div>
            )}
            <div className="reserve-messenger-launcher-wrap">
                <Badge count={!isMobile && open ? 0 : unreadCount} offset={[-4, 4]}
                    styles={{ indicator: { background: 'var(--reserve-messenger-unread-bg)', color: '#fff' } }}>
                    <button
                        ref={launcherRef}
                        type="button"
                        className={`reserve-chat-launcher reserve-messenger-launcher${!isMobile && open ? ' is-open' : ''}`}
                        onClick={() => openMessages({ toggle: true })}
                        aria-label={!isMobile && open ? '메시지 창 닫기' : `${messagesLabel} 열기`}
                        aria-expanded={!isMobile && open}
                    >
                        <MessengerLauncherVisual isOpen={!isMobile && open} imageSrc={launcherImageSrc} />
                    </button>
                </Badge>
            </div>
        </>
    );
};

MessengerShell.propTypes = { launcherImageSrc: PropTypes.string, coverImageSrc: PropTypes.string };

export default MessengerShell;
