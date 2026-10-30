import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MessengerContent from '../../components/chat/MessengerContent';
import { MESSENGER_ROUTE_CLOSE_EVENT } from '../../components/chat/messengerRouteTransition';
import { useDocumentEntry, useSkeletonShown } from '../../components/layout/loadingPresentation';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useGoBack from '../../hooks/useGoBack';
import { useWindowWidth } from '../../hooks';
import useMessengerStore from '../../store/useMessengerStore';
import useAuthStore from '../../store/useAuthStore';
import { parseSearchMessageTarget } from '../../utils/searchResults';
import { breakpoints } from '../../styles/tokens';

const EXIT_FALLBACK_MS = 360;

const MessagesPage = () => {
    useDocumentTitle('메시지');
    const [params] = useSearchParams();
    const goBack = useGoBack('/');
    const width = useWindowWidth();
    const openPanel = useMessengerStore((state) => state.openPanel);
    const openStore = useMessengerStore((state) => state.openStore);
    const openSupport = useMessengerStore((state) => state.openSupport);
    const openOwnerRoom = useMessengerStore((state) => state.openOwnerRoom);
    const userRole = useAuthStore(state => state.user?.role);
    const initialSelection = parseSearchMessageTarget(params, userRole);
    const skeletonShown = useSkeletonShown();
    const documentEntry = useDocumentEntry();
    const [entryRequested] = useState(() => !skeletonShown && !documentEntry);
    const animateEntry = entryRequested && !documentEntry;
    const [closing, setClosing] = useState(false);
    const pageRef = useRef(null);
    const completedRef = useRef(false);
    // 닫기 요청이 목적지를 주면(로고 → 홈) 닫힘 애니메이션 뒤 그곳으로 간다. 없으면 이전 화면.
    const closeTargetRef = useRef(null);
    const navigate = useNavigate();
    const handOffToDesktopPanel = width >= breakpoints.tablet;

    // /messages는 모바일 전용 경로다. 창 복원·직접 주소·새로고침으로 PC에서 이 경로에
    // 들어와도 빈 바탕의 단독 채팅 화면을 남기지 않고 원래 화면의 데스크톱 패널로 넘긴다.
    useEffect(() => {
        if (!handOffToDesktopPanel || completedRef.current) return;
        completedRef.current = true;
        const target = parseSearchMessageTarget(params, userRole);
        if (target?.kind === 'store') openStore(target.storeId);
        else if (target?.kind === 'owner') openOwnerRoom(target.roomId);
        else if (target?.kind === 'support') openSupport();
        else openPanel();
        goBack();
    }, [goBack, handOffToDesktopPanel, openPanel, openStore, openOwnerRoom, openSupport, params, userRole]);

    const finishClose = useCallback(() => {
        if (completedRef.current) return;
        completedRef.current = true;
        if (closeTargetRef.current) navigate(closeTargetRef.current);
        else goBack();
    }, [goBack, navigate]);
    const requestClose = useCallback(() => {
        if (completedRef.current) return;
        // 닫히는 본문의 포커스를 해제한 뒤 상호작용을 막아요.
        const focused = document.activeElement;
        if (pageRef.current?.contains(focused)) focused.blur();
        setClosing(true);
    }, []);

    useEffect(() => {
        const handleRouteClose = (event) => {
            event.preventDefault();
            closeTargetRef.current = event.detail?.to || null;
            requestClose();
        };
        window.addEventListener(MESSENGER_ROUTE_CLOSE_EVENT, handleRouteClose);
        return () => window.removeEventListener(MESSENGER_ROUTE_CLOSE_EVENT, handleRouteClose);
    }, [requestClose]);

    // reduced-motion 또는 백그라운드 탭처럼 animationend가 생략되는 경우에도 닫기를 끝낸다.
    useEffect(() => {
        if (!closing) return undefined;
        const timer = setTimeout(finishClose, EXIT_FALLBACK_MS);
        return () => clearTimeout(timer);
    }, [closing, finishClose]);

    if (handOffToDesktopPanel) return null;

    return (
        <div
            ref={pageRef}
            className={`reserve-messages-page reserve-messages-route${closing ? ' is-closing' : animateEntry ? ' is-opening' : ''}`}
            onAnimationEnd={(event) => {
                if (event.target === event.currentTarget && closing) finishClose();
            }}
            inert={closing ? true : undefined}
        >
            <MessengerContent surface="page" initialSelection={initialSelection} onClose={requestClose} />
        </div>
    );
};

export default MessagesPage;
