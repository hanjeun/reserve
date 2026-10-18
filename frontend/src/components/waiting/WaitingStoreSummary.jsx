import PropTypes from 'prop-types';
import InfoHint from '../common/InfoHint';

export default function WaitingStoreSummary({ store }) {
    const mode = store.waitingIntakeMode;
    const state = store.waitingPaused ? 'paused' : mode === 'ONSITE' ? 'onsite' : 'open';
    const label = state === 'paused' ? '접수 중지' : state === 'onsite' ? '현장 접수만 가능' : '접수 가능';
    const teams = store.waitingTeams;
    const known = Number.isSafeInteger(teams) && teams >= 0;
    const count = known ? `대기 ${teams.toLocaleString('ko-KR')}팀` : '대기 팀 수 확인 중';
    return (
        <InfoHint label={`웨이팅 정보: ${label}, ${count}`}>
            <span>{label}</span>
            <span className="reserve-waiting-store-count">{count}</span>
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
