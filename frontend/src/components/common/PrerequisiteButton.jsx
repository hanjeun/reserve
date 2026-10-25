import PropTypes from 'prop-types';
import Button from './Button';
import useMessage from '../../hooks/useMessage';

/* 미충족 조건은 IconTool과 같은 안내 방식으로 표시한다. */
export default function PrerequisiteButton({ unavailableReason = '', ...props }) {
    const { message } = useMessage();
    return <Button {...props} unavailableReason={unavailableReason} onUnavailable={reason => message.info(reason)} />;
}

PrerequisiteButton.propTypes = { unavailableReason: PropTypes.string };
