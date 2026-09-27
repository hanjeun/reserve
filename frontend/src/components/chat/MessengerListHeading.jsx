import PropTypes from 'prop-types';
import { ReloadOutlined } from '@ant-design/icons';

export default function MessengerListHeading({ headingLevel = 2, onRefresh, refreshing = false }) {
    const Heading = `h${headingLevel}`;
    return (
        <header className="reserve-messenger-list-heading">
            <Heading>대화</Heading>
            <button
                type="button"
                className={`reserve-messenger-list-refresh${refreshing ? ' is-refreshing' : ''}`}
                onClick={refreshing ? undefined : onRefresh}
                aria-disabled={refreshing || undefined}
                aria-label="대화 목록 새로고침"
                aria-busy={refreshing || undefined}
            >
                <ReloadOutlined spin={refreshing} aria-hidden="true" />
            </button>
        </header>
    );
}

MessengerListHeading.propTypes = {
    headingLevel: PropTypes.oneOf([1, 2]),
    onRefresh: PropTypes.func.isRequired,
    refreshing: PropTypes.bool,
};
