import PropTypes from 'prop-types';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import useAuthStore from '../../store/useAuthStore';
import waitingService from '../../services/waitingService';
import { Button, DataState, ModalLoading } from '../common';
import ResponsiveModal from '../common/ResponsiveModal';

export default function WaitingQrModal({ open, onClose, entryId, storeId }) {
    const revision = useAuthStore(state => state.sessionRevision);
    const loggedIn = useAuthStore(state => state.isLoggedIn);
    const onsite = storeId != null;
    const [expiredToken, setExpiredToken] = useState(null);
    const qr = useQuery({ queryKey: ['waitingQr', revision, onsite ? 'onsite' : 'entry', storeId ?? entryId],
        queryFn: async ({ signal }) => {
            const token = await (onsite ? waitingService.getOnsiteQr(storeId, signal) : waitingService.getEntryQr(entryId, signal));
            if (!token?.token || !(new Date(token.expiresAt).getTime() > Date.now())) throw new Error('QR 유효 시간이 지났어요. 새 QR을 불러와주세요.');
            return token;
        },
        enabled: Boolean(open && loggedIn && (storeId ?? entryId)), staleTime: 0, gcTime: 0, retry: false,
        refetchInterval: open ? (onsite ? 10 * 60_000 : 4 * 60_000) : false, refetchIntervalInBackground: false });
    useEffect(() => {
        if (!qr.data?.token) return undefined;
        const timer = setTimeout(() => setExpiredToken(qr.data.token), Math.max(0, new Date(qr.data.expiresAt).getTime() - Date.now()));
        return () => clearTimeout(timer);
    }, [qr.data]);
    const valid = qr.data?.token && qr.data.token !== expiredToken;
    const value = valid ? onsite
        ? `${window.location.origin}/store/${storeId}#waiting-token=${encodeURIComponent(qr.data.token)}` : qr.data.token : null;
    return <ResponsiveModal title={onsite ? '현장 웨이팅 접수 QR' : '웨이팅 입장 QR'} open={open} onCancel={onClose}
        footer={null} width={340} mobileSize="content" centered>
        <div className="reserve-waiting-qr">
            {qr.isFetching ? <ModalLoading text="QR 코드를 불러오는 중..." minHeight="260px" />
                : value && !qr.error ? <div className="reserve-waiting-qr-plate"><QRCodeSVG value={value} size={260}
                    level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" /></div>
                    : <DataState state="error" subject="웨이팅 QR" error={qr.error} compact
                        title="QR을 다시 불러와주세요." onRetry={qr.refetch} retrying={qr.isFetching} />}
            <p>{onsite ? '도착한 손님이 휴대폰으로 스캔해 접수할 수 있어요.' : '호출 후 직원에게 이 QR을 보여주세요.'}</p>
            <Button variant="outline" size="sm" loading={qr.isFetching} onClick={() => qr.refetch()}>새 QR 보기</Button>
        </div>
    </ResponsiveModal>;
}
WaitingQrModal.propTypes = { open: PropTypes.bool, onClose: PropTypes.func.isRequired,
    entryId: PropTypes.number, storeId: PropTypes.number };
