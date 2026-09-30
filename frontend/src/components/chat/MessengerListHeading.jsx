import PropTypes from 'prop-types';
import { EyeInvisibleOutlined, EyeOutlined, SyncOutlined } from '@ant-design/icons';
import useRefreshCooldown from '../../hooks/useRefreshCooldown';

export default function MessengerListHeading({ headingLevel = 2, onRefresh, refreshing = false, showHidden = false, onToggleHidden }) {
    const Heading = `h${headingLevel}`;
    const { reload, blocked } = useRefreshCooldown(onRefresh, refreshing);
    const hiddenLabel = showHidden ? '일반 대화 보기' : '숨긴 대화 보기';
    return (
        <header className="reserve-messenger-list-heading">
            <Heading>{showHidden ? '숨긴 대화' : '대화'}</Heading>
            <div className="reserve-messenger-list-actions">
                {onToggleHidden && (
                    <button
                        type="button"
                        className="reserve-messenger-list-refresh"
                        onClick={onToggleHidden}
                        aria-pressed={showHidden}
                        aria-label={hiddenLabel}
                        title={hiddenLabel}
                    >
                        {showHidden ? <EyeOutlined aria-hidden="true" /> : <EyeInvisibleOutlined aria-hidden="true" />}
                    </button>
                )}
                <button
                    type="button"
                    className={`reserve-messenger-list-refresh${refreshing ? ' is-refreshing' : ''}`}
                    onClick={reload}
                    aria-disabled={blocked || undefined}
                    aria-label="대화 목록 새로고침"
                    title="새로고침"
                    aria-busy={refreshing || undefined}
                >
                    <SyncOutlined spin={refreshing} aria-hidden="true" />
                </button>
            </div>
        </header>
    );
}

MessengerListHeading.propTypes = {
    headingLevel: PropTypes.oneOf([1, 2]),
    onRefresh: PropTypes.func.isRequired,
    refreshing: PropTypes.bool,
    showHidden: PropTypes.bool,
    onToggleHidden: PropTypes.func,
};
