import PropTypes from 'prop-types';
import PrerequisiteButton from '../common/PrerequisiteButton';

export default function LoginMethodFormActions({ submitLabel, submitText = submitLabel, busy = false, unavailableReason = '' }) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <PrerequisiteButton variant="primary" size="sm" htmlType="submit" aria-label={submitLabel}
            style={{ flex: 1, minWidth: 0 }} loading={busy} unavailableReason={unavailableReason}>{submitText}</PrerequisiteButton>
    </div>;
}
LoginMethodFormActions.propTypes = { submitLabel: PropTypes.string.isRequired, submitText: PropTypes.string, busy: PropTypes.bool,
    unavailableReason: PropTypes.string };
