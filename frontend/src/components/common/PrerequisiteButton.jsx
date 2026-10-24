import PropTypes from 'prop-types';
import Button from './Button';
import useMessage from '../../hooks/useMessage';

/** Explain missing prerequisites using the same message treatment as IconTool. */
export default function PrerequisiteButton({ unavailableReason = '', ...props }) {
    const { message } = useMessage();
    return <Button {...props} unavailableReason={unavailableReason} onUnavailable={reason => message.info(reason)} />;
}

PrerequisiteButton.propTypes = { unavailableReason: PropTypes.string };
