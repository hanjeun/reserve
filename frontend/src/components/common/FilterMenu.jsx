import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Dropdown } from 'antd';
import { CheckOutlined, DownOutlined } from '@ant-design/icons';
import { SpinIndicator } from './Loading';
import { renderRollingChoiceLabel } from './rollingChoiceLabel';

const renderFilterPopup = (menu, popupRef) => <div ref={popupRef}>{menu}</div>;

/** 입력 없는 목록 조작 메뉴. 모바일 키보드와 Select 내부 입력의 포커스 링을 만들지 않는다. */
export default function FilterMenu({ value, options, onChange, appearance = 'chip', icon, disabled = false, loading = false, className, ...rest }) {
    const [open, setOpen] = useState(false);
    const triggerRef = useRef(null);
    const popupRef = useRef(null);
    const selected = options.find(option => option.value === value);

    // 열 때 목록을 선택한 항목 기준으로 맞춘다. 첫 항목이 선택돼 있으면 맨 위에서 시작한다 —
    // 항목이 목록 높이를 조금 넘으면 브라우저가 스크롤을 남겨 첫 항목 윗부분이 잘려 보였다(2026-09-29).
    useEffect(() => {
        if (!open) return undefined;
        const frame = requestAnimationFrame(() => {
            const list = popupRef.current?.querySelector('.reserve-filter-menu-options');
            if (!list) return;
            const active = list.querySelector('.ant-dropdown-menu-item-selected');
            const overflow = active ? active.offsetTop + active.offsetHeight - list.clientHeight : 0;
            list.scrollTop = overflow > 0 ? overflow + 4 : 0;
        });
        return () => cancelAnimationFrame(frame);
    }, [open]);

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
            popupRender={menu => renderFilterPopup(menu, popupRef)}
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
                    <span className="reserve-filter-menu-label">{renderRollingChoiceLabel({ value, label: selected?.label ?? '선택' }, { options })}</span>
                    {loading ? <span aria-hidden="true"><SpinIndicator /></span> : <DownOutlined className="reserve-filter-menu-chevron" aria-hidden="true" />}
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
