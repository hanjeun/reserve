import PropTypes from 'prop-types';
import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import InfoHint from '../common/InfoHint';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';

export default function WaitingStoreSummary({ store }) {
    const client = useQueryClient();
    const live = useLiveUpdatesStatus();
    const [open, setOpen] = useState(false);
    const refreshOnOpen = useCallback(open => {
        setOpen(open);
        if (open) void client.invalidateQueries({ queryKey: ['waiting-stores'] }, { cancelRefetch: false });
    }, [client]);
    const liveWaiting = live.connected && live.domains.includes('WAITING');
    useEffect(() => {
        if (!open || liveWaiting) return undefined;
        const timer = window.setInterval(() => {
            if (!document.hidden) void client.invalidateQueries({ queryKey: ['waiting-stores'] }, { cancelRefetch: false });
        }, 5000);
        return () => window.clearInterval(timer);
    }, [client, open, liveWaiting]);
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
        waitingIntakeMode: PropTypes.string,
        waitingPaused: PropTypes.bool,
        waitingTeams: PropTypes.number,
    }).isRequired,
};
