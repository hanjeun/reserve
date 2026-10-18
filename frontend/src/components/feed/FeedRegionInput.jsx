import { useState } from 'react';
import PropTypes from 'prop-types';
import { ConfigProvider } from 'antd';
import { DownOutlined, EnvironmentOutlined } from '../common/icons';
import FeedRegionSheet from './FeedRegionSheet';
import { formatRegionLabel } from '../../constants/regions';

export default function FeedRegionInput({ value, onChange, disabled: disabledProp }) {
    const { componentDisabled } = ConfigProvider.useConfig();
    const disabled = disabledProp ?? componentDisabled;
    const [open, setOpen] = useState(false);
    return <>
        <button type="button" className="reserve-feed-region-input" disabled={disabled} aria-haspopup="dialog" aria-expanded={open}
            aria-label={`게시물 지역 선택, ${value ? formatRegionLabel(value) : '지역 없이 게시'}`} onClick={() => setOpen(true)}>
            <EnvironmentOutlined aria-hidden="true" /><span>{value ? formatRegionLabel(value) : '지역 없이 게시'}</span>
            <DownOutlined className="reserve-filter-menu-chevron" aria-hidden="true" style={{ marginLeft: 'auto' }} />
        </button>
        <FeedRegionSheet open={open} value={value || ''} onClose={() => setOpen(false)} onApply={region => { onChange?.(region || null); setOpen(false); }} />
    </>;
}
FeedRegionInput.propTypes = { value: PropTypes.string, onChange: PropTypes.func, disabled: PropTypes.bool };
