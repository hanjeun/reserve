import PropTypes from 'prop-types';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import InfoHint from '../common/InfoHint';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';
import { storeKeys } from '../../hooks/queryKeys';

export default function WaitingStoreSummary({ store, detail = false }) {
    const client = useQueryClient();
    const live = useLiveUpdatesStatus();
    const [open, setOpen] = useState(false);
    const { id: storeId, publicId } = store;
    const refresh = useCallback(() => client.invalidateQueries(detail
        ? { queryKey: storeKeys.all(), predicate: ({ queryKey }) => queryKey.length === 3 && queryKey[1] === 'detail'
            && [String(storeId), publicId].includes(String(queryKey[2])) }
        : { queryKey: ['waiting-stores'] }, { cancelRefetch: false }), [client, detail, storeId, publicId]);
    const refreshOnOpen = useCallback(open => {
        setOpen(open);
        if (open) void refresh();
    }, [refresh]);
    const liveWaiting = live.connected && live.domains.includes(detail ? 'STORE' : 'WAITING');
    useEffect(() => {
        if (!open || liveWaiting) return undefined;
        const timer = window.setInterval(() => {
            if (!document.hidden) void refresh();
        }, 5000);
        return () => window.clearInterval(timer);
    }, [refresh, open, liveWaiting]);
    const mode = store.waitingIntakeMode;
    const state = store.waitingPaused ? 'paused' : mode === 'ONSITE' ? 'onsite' : 'open';
    const label = state === 'paused' ? '접수 중지' : state === 'onsite' ? '현장 접수만 가능' : '접수 가능';
    const teams = store.waitingTeams;
    const known = Number.isSafeInteger(teams) && teams >= 0;
    const count = known ? `대기 ${teams.toLocaleString('ko-KR')}팀` : '대기 팀 수 확인 중';
    return (
        <InfoHint label={`웨이팅 정보: ${label}, ${count}`} onOpenChange={refreshOnOpen}>
            <span>{label}</span>
            <span className="reserve-waiting-store-count" aria-live="polite">{count}</span>
        </InfoHint>
    );
}
WaitingStoreSummary.propTypes = {
    store: PropTypes.shape({
        id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
        publicId: PropTypes.string,
        waitingIntakeMode: PropTypes.string,
        waitingPaused: PropTypes.bool,
        waitingTeams: PropTypes.number,
    }).isRequired,
    detail: PropTypes.bool,
};
