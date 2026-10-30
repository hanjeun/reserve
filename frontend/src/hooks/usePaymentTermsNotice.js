import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { currentSession, isCurrentSession } from '../api/sessionScope';
import useAuthStore from '../store/useAuthStore';
import { consumePaymentTermsReturn, rememberPaymentTermsReturn } from '../utils/paymentReturnContext';
import useMessage from './useMessage';

export default function usePaymentTermsNotice() {
    const location = useLocation();
    const navigationType = useNavigationType();
    const navigate = useNavigate();
    const memberId = useAuthStore(state => state.user?.id);
    const { modal } = useMessage();
    const current = useRef(null);
    useLayoutEffect(() => {
        current.current = { memberId, key: location.key };
        return () => { current.current = null; };
    }, [memberId, location.key]);
    useEffect(() => {
        const epoch = currentSession().epoch;
        const notice = consumePaymentTermsReturn(location, memberId, epoch, navigationType);
        if (!notice) return;
        const reservation = notice.kind === 'RESERVATION';
        let confirmed = false;
        modal.info({ title: '결제 내용을 다시 확인해주세요',
            content: reservation ? '내 예약에서 현재 상태를 확인하고 결제를 이어갈 수 있어요.'
                : '광고 관리에서 현재 상태를 확인하고 결제를 이어갈 수 있어요.',
            okText: reservation && location.pathname !== '/my-reservations' ? '내 예약' : '확인',
            centered: true, rootClassName: 'reserve-confirm-root',
            onOk: () => { confirmed = true; },
            afterClose: () => {
                if (!confirmed) return;
                confirmed = false;
                const active = current.current;
                if (!active || !isCurrentSession(epoch) || active.memberId !== memberId || active.key !== location.key) return;
                if (reservation && location.pathname !== '/my-reservations')
                    navigate('/my-reservations', { state: { refetch: true, reserveRouteMotion: 'from-right' } });
            },
        });
    }, [location, memberId, navigationType, modal, navigate]);
    return useCallback(kind => rememberPaymentTermsReturn(location, memberId, currentSession().epoch, kind), [location, memberId]);
}
