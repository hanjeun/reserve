import { useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { CheckOutlined, DownOutlined, LoadingOutlined } from '@ant-design/icons';

/** 입력 없는 목록 조작 메뉴. 모바일 키보드와 Select 내부 입력의 포커스 링을 만들지 않는다. */
export default function FilterMenu({ value, options, onChange, appearance = 'chip', icon, disabled = false, loading = false, className, ...rest }) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const selected = options.find(option => option.value === value);

    const closeWithFocus = () => {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
    };

    return (
        <Dropdown
            trigger={['click']}
            placement={appearance === 'plain' ? 'bottomRight' : 'bottomLeft'}
            autoFocus
            open={open && !disabled}
            disabled={disabled}
            onOpenChange={nextOpen => setOpen(nextOpen)}
            menu={{
                className: 'reserve-filter-menu-options',
                selectable: true,
                selectedKeys: [String(value)],
                items: options.map(option => ({
                    key: String(option.value),
                    disabled: option.disabled,
                    role: 'menuitemradio',
                    'aria-checked': option.value === value,
                    label: (
                        <span className="reserve-filter-menu-option">
                            <span>{option.label}</span>
                            {option.value === value && <CheckOutlined aria-hidden="true" />}
                        </span>
                    ),
                })),
                onClick: ({ key }) => {
                    const option = options.find(item => String(item.value) === key);
                    setOpen(false);
                    if (option && option.value !== value) onChange(option.value);
                },
                onKeyDown: event => {
                    if (event.key === 'Escape') {
                        event.preventDefault();
                        event.stopPropagation();
                        closeWithFocus();
                    }
                },
            }}
        >
            <button
                {...rest}
                ref={triggerRef}
                type="button"
                className={['reserve-filter-menu', 'reserve-filter-menu--' + appearance, className].filter(Boolean).join(' ')}
                disabled={disabled}
                aria-haspopup="menu"
                aria-expanded={open && !disabled}
                aria-busy={loading || undefined}
                onKeyDown={event => {
                    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <span className="reserve-filter-menu-surface">
                    {icon}
                    <span className="reserve-filter-menu-label">{selected?.label ?? '선택'}</span>
                    {loading ? <LoadingOutlined aria-hidden="true" /> : <DownOutlined className="reserve-filter-menu-chevron" aria-hidden="true" />}
                </span>
            </button>
        </Dropdown>
    );
}

FilterMenu.propTypes = {
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired, label: PropTypes.node.isRequired, disabled: PropTypes.bool })).isRequired,
    onChange: PropTypes.func.isRequired,
    appearance: PropTypes.oneOf(['chip', 'plain']),
    icon: PropTypes.node,
    disabled: PropTypes.bool,
    loading: PropTypes.bool,
    className: PropTypes.string,
};
