import { useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import Bone from '../common/Bone';
import DataState from '../common/DataState';
import LoadingStatus from '../common/LoadingStatus';
import ReservationDetailModal from './ReservationDetailModal';
import chatService from '../../services/chatService';

function NotificationReservationModal({ id, open, onClose }) {
    const detail = useQuery({
        queryKey: ['notification-reservation', id],
        queryFn: ({ signal }) => chatService.getNotificationReservation(id, signal),
        enabled: open,
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });
    let placeholder;
    if (detail.isPending || detail.isFetching) {
        placeholder = <LoadingStatus aria-label="예약 상세를 불러오는 중" aria-busy="true">
            <Bone height={120} borderRadius={12} />
        </LoadingStatus>;
    } else if (detail.isError) {
        placeholder = <DataState state="error" kind="reservation" requestType="detail" subject="예약 상세"
            error={detail.error} compact onRetry={detail.refetch} />;
    }
    return <ReservationDetailModal reservation={placeholder ? null : detail.data}
        open={open} onClose={onClose} placeholder={placeholder} />;
}

NotificationReservationModal.propTypes = {
    id: PropTypes.number.isRequired,
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
};

export default function NotificationReservationDetail() {
    const [params, setParams] = useSearchParams();
    const value = params.get('notification');
    const parsed = Number(value);
    const id = /^[1-9]\d*$/.test(value ?? '') && Number.isSafeInteger(parsed) ? parsed : null;
    const [lastId, setLastId] = useState(id);
    if (id != null && id !== lastId) setLastId(id);
    const target = id ?? lastId;
    if (target == null) return null;

    const close = () => setParams(current => {
        const next = new URLSearchParams(current);
        next.delete('notification');
        return next;
    }, { replace: true });
    return <NotificationReservationModal id={target} open={id != null} onClose={close} />;
}
