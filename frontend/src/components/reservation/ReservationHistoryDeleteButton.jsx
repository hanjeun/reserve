import PropTypes from 'prop-types';
import Button from '../common/Button';
import { DeleteOutlined } from '../common/icons';
import { colors } from '../../styles/tokens';

export default function ReservationHistoryDeleteButton({ onClick, disabled, loading, className }) {
    return <Button variant="ghost-sm" size="sm" disabled={disabled} loading={loading} className={className}
        onClick={event => { event.stopPropagation(); onClick(); }} style={{ color: colors.text.tertiary }}>
        <DeleteOutlined aria-hidden="true" /> 삭제
    </Button>;
}

ReservationHistoryDeleteButton.propTypes = {
    onClick: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
    loading: PropTypes.bool,
    className: PropTypes.string,
};
