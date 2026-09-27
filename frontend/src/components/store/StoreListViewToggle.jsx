import PropTypes from 'prop-types';
import { AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';

export default function StoreListViewToggle({ view, onChange, disabled = false }) {
    const isList = view === 'list';
    const label = isList ? '사진형 보기로 전환' : '목록형 보기로 전환';
    return (
        <button
            type="button"
            className="reserve-store-view-toggle"
            aria-label={label}
            title={label}
            data-view={view}
            disabled={disabled}
            aria-busy={disabled || undefined}
            onClick={() => onChange(isList ? 'cards' : 'list')}
        >
            {isList ? <AppstoreOutlined aria-hidden="true" /> : <UnorderedListOutlined aria-hidden="true" />}
        </button>
    );
}

StoreListViewToggle.propTypes = {
    view: PropTypes.oneOf(['cards', 'list']).isRequired,
    onChange: PropTypes.func.isRequired,
    disabled: PropTypes.bool,
};
