import PropTypes from 'prop-types';
import { SyncOutlined } from '@ant-design/icons';
import useRefreshCooldown from '../../hooks/useRefreshCooldown';

export default function MessengerListHeading({ headingLevel = 2, onRefresh, refreshing = false }) {
    const Heading = `h${headingLevel}`;
    const { reload, blocked } = useRefreshCooldown(onRefresh, refreshing);
    return (
        <header className="reserve-messenger-list-heading">
            <Heading>대화</Heading>
            <button
                type="button"
                className={`reserve-messenger-list-refresh${refreshing ? ' is-refreshing' : ''}`}
                onClick={reload}
                aria-disabled={blocked || undefined}
                aria-label="대화 목록 새로고침"
                aria-busy={refreshing || undefined}
            >
                <SyncOutlined spin={refreshing} aria-hidden="true" />
            </button>
        </header>
    );
}

MessengerListHeading.propTypes = {
    headingLevel: PropTypes.oneOf([1, 2]),
    onRefresh: PropTypes.func.isRequired,
    refreshing: PropTypes.bool,
};
