import PropTypes from 'prop-types';
import { Tag } from 'antd';
import Tooltip from './Tooltip';
import useInputModality from '../../hooks/useInputModality';

/* 필수 상태 사유는 터치 툴팁 없이도 읽을 수 있게 한다. */
export default function StatusHint({ label, color, description }) {
    const modality = useInputModality();
    return <span className="reserve-status-hint">
        <Tooltip title={description}><Tag color={color} tabIndex={description ? 0 : undefined}
            aria-label={description ? `${label}, ${description}` : undefined}>{label}</Tag></Tooltip>
        {description && <span className="reserve-status-hint-description" data-touch={modality === 'touch' ? 'true' : undefined}>
            {description}
        </span>}
    </span>;
}
StatusHint.propTypes = { label: PropTypes.string.isRequired, color: PropTypes.string, description: PropTypes.string };
