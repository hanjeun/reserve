import PropTypes from 'prop-types';
import UnderlinedTextButton from '../common/UnderlinedTextButton';

export default function StatisticsCsvAction({ loading = false, disabled, onClick, 'aria-label': label }) {
    return <UnderlinedTextButton loading={loading} disabled={disabled} aria-label={label} onClick={onClick}>CSV 다운로드</UnderlinedTextButton>;
}

StatisticsCsvAction.propTypes = { loading: PropTypes.bool, disabled: PropTypes.bool, onClick: PropTypes.func, 'aria-label': PropTypes.string };
