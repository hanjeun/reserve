import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { currentSession, isCurrentSession } from '../api/sessionScope';
import useAuthStore from '../store/useAuthStore';
import useMessage from './useMessage';

/** PC·모바일 모두 서버가 확인한 선결제 예약의 중단만 같은 모달로 안내해요. */
export default function usePaymentIncompleteNotice() {
    const location = useLocation();
    const navigate = useNavigate();
    const memberId = useAuthStore(state => state.user?.id);
    const { modal } = useMessage();
    const displayed = useRef(null);
    const current = useRef(null);
    useLayoutEffect(() => {
        current.current = { memberId, location };
        return () => { current.current = null; };
    }, [memberId, location]);
    useEffect(() => {
        const notice = location.state?.paymentIncomplete;
        if (!notice || displayed.current === location.key) return;
        displayed.current = location.key;
        const { paymentIncomplete: _notice, ...state } = location.state;
        navigate({ pathname: location.pathname, search: location.search, hash: location.hash }, { replace: true, state });
        if (!memberId || notice.memberId !== memberId) return;
        const session = currentSession().epoch;
        let confirmed = false;
        modal.info({ title: '결제가 완료되지 않았어요',
            content: '내 예약에 결제 대기 상태로 남아 있어요. 내 예약에서 결제를 이어갈 수 있어요. 기한이 지나면 자동 취소돼요.',
            okText: '확인', centered: true, rootClassName: 'reserve-confirm-root',
            onOk: () => { confirmed = true; },
            afterClose: () => {
                if (!confirmed) return;
                confirmed = false;
                const active = current.current;
                // 닫힘 중 계정이나 화면이 바뀌면 이전 안내가 새 이동을 덮지 않아요.
                if (!active || !isCurrentSession(session) || active.memberId !== memberId
                    || active.location.pathname !== location.pathname || active.location.search !== location.search
                    || active.location.hash !== location.hash || location.pathname === '/my-reservations') return;
                navigate('/my-reservations', { state: { refetch: true, reserveRouteMotion: 'from-right' } });
            },
        });
    }, [location, navigate, memberId, modal]);
}
