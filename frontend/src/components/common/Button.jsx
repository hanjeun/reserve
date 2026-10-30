import React, { useId } from 'react';
import PropTypes from 'prop-types';
import { SpinIndicator } from './Loading';
import Tooltip from './Tooltip';
import { colors, radius, heights, fontWeight, fontSize, shadows, transitions } from '../../styles/tokens';

const VARIANTS = {
    primary: {
        background: colors.primary.solid,
        color: colors.primary.foreground,
        border: 'none',
        borderRadius: radius.xl,
        boxShadow: 'none',
    },
    secondary: {
        background: colors.gray[100],
        color: colors.text.secondary,
        border: 'none',
        borderRadius: radius.xl,
        boxShadow: 'none',
    },
    'ghost-sm': {
        background: 'transparent',
        color: colors.text.secondary,
        border: 'none',
        borderRadius: radius.md,
        boxShadow: 'none',
        padding: '0',
    },
    'ghost-sm-primary': {
        background: 'transparent',
        color: colors.primary.main,
        border: 'none',
        borderRadius: radius.md,
        boxShadow: 'none',
        padding: '0',
    },
    'ghost-sm-success': {
        background: 'transparent',
        color: colors.success?.main || '#52c41a',
        border: 'none',
        borderRadius: radius.md,
        boxShadow: 'none',
        padding: '0',
    },
    'ghost-sm-danger': {
        background: 'transparent',
        color: colors.error?.main || '#ff4d4f',
        border: 'none',
        borderRadius: radius.md,
        boxShadow: 'none',
        padding: '0',
    },
    hero: {
        background: colors.primary.solid,
        color: colors.primary.foreground,
        border: 'none',
        borderRadius: radius.pill,
        boxShadow: shadows.buttonHover,
        padding: '0 40px',
    },
    outline: {
        background: 'transparent',
        // 테두리 버튼은 본문과 같은 진한 글자를 사용한다.

        color: colors.text.primary,
        border: `1px solid ${colors.border.default}`,
        borderRadius: radius.xl,
        boxShadow: 'none',
    },
    ghost: {
        background: 'transparent',
        color: colors.text.secondary,
        border: 'none',
        borderRadius: radius.md,
        boxShadow: 'none',
    },
    danger: {
        background: colors.error.solid,
        color: colors.error.foreground,
        border: 'none',
        borderRadius: radius.xl,
        boxShadow: 'none',
    },
    link: {
        background: 'transparent',
        color: colors.primary.main,
        border: 'none',
        boxShadow: 'none',
        padding: '0 4px',
    },
};

const SIZE_HEIGHT = {
    sm:   heights.buttonSm,
    md:   heights.buttonMd,
    lg:   heights.buttonLg,
    hero: heights.buttonHero,
};

/* 소형 일반 버튼은 모달과 같은 좌우 여백을 사용한다. */
const SM_PADDING_X = { primary: 20, danger: 20, outline: 20, secondary: 20, ghost: 20 };

const SIZE_FONT = {
    sm:   fontSize.sm,
    md:   fontSize.base,
    lg:   fontSize.lg,
    hero: '19px',
};

function resolveHeight(variant, size) {
    if (variant.startsWith('ghost-sm') || variant === 'link') return 'auto';
    if (variant === 'hero') return heights.buttonHero;
    return SIZE_HEIGHT[size];
}

function resolveFontSize(variant, size) {
    if (variant.startsWith('ghost-sm')) return fontSize.sm;
    if (variant === 'hero') return '19px';
    return SIZE_FONT[size];
}

function resolvePadding(variant, size) {
    if (variant.startsWith('ghost-sm')) return '2px 0';
    if (size === 'sm' && SM_PADDING_X[variant]) return `0 ${SM_PADDING_X[variant]}px`;
    return undefined;
}

function renderLeadingIcon({ loading, loadingIcon, icon, children, iconOnly }) {
    if (loading) {
        return loadingIcon
            ? <span className="reserve-btn-loading-icon" aria-hidden="true">{loadingIcon}</span>
            : <span className="reserve-btn-spin" aria-hidden="true"><SpinIndicator /></span>;
    }
    return icon && (
        <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: iconOnly ? 'var(--reserve-icon-glyph-size, 20px)' : '0.9em' }} aria-hidden={children ? 'true' : undefined}>{icon}</span>
    );
}

const Button = ({
    variant = 'primary',
    size = 'lg',
    block = false,
    loading = false,
    disabled = false,
    unavailableReason = '',
    onUnavailable,
    htmlType = 'button',
    icon,
    loadingIcon,
    children,
    style,
    onClick,
    className,
    ...rest
}) => {
    const reasonId = useId();
    const isGhostSm = variant.startsWith('ghost-sm');
    const iconOnly = icon != null && React.Children.count(children) === 0;
    const neutralText = !iconOnly && ['ghost', 'ghost-sm'].includes(variant)
        && (style?.color == null || [colors.text.secondary, colors.text.tertiary].includes(style.color));
    const smallButtonRadius = iconOnly ? radius.md : radius.pill;

    const v = VARIANTS[variant] || VARIANTS.primary;

    const buttonHeight   = resolveHeight(variant, size);
    const buttonFontSize = resolveFontSize(variant, size);
    const buttonPadding  = resolvePadding(variant, size);

    const baseStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        cursor: disabled || unavailableReason ? 'not-allowed' : 'pointer',
        // 활성 상태의 opacity는 공통 CSS에서 처리한다.
        opacity: disabled || unavailableReason ? 0.45 : undefined,
        fontWeight: isGhostSm ? fontWeight.medium : fontWeight.bold,
        fontSize: buttonFontSize,
        height: buttonHeight,
        width: block ? '100%' : undefined,
        transition: neutralText ? undefined : `all ${transitions.fast} ${transitions.easing}`,
        userSelect: 'none',
        padding: buttonPadding,
        ...v,
        ...(size === 'sm' && !isGhostSm && variant !== 'link' ? { borderRadius: smallButtonRadius } : {}),
        ...(iconOnly ? { height: heights.buttonMd, width: heights.buttonMd, minWidth: heights.buttonMd, flexShrink: 0, padding: 0 } : {}),
        ...style,
        ...(neutralText ? { color: undefined } : {}),
    };

    const handleClick = (e) => {
        if (disabled || loading) return;
        if (unavailableReason) {
            e.preventDefault();
            onUnavailable?.(unavailableReason);
            return;
        }
        onClick?.(e);
    };

    const leadingIcon = renderLeadingIcon({ loading, loadingIcon, icon, children, iconOnly });

    const button = (
        <button
            type={htmlType}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            onClick={handleClick}
            className={['reserve-btn', `reserve-btn--${variant}`, iconOnly && 'reserve-btn--icon-only', neutralText && 'reserve-text-link', className].filter(Boolean).join(' ')}
            style={baseStyle}
            {...rest}
            aria-disabled={unavailableReason ? true : rest['aria-disabled']}
            aria-describedby={[rest['aria-describedby'], unavailableReason && reasonId].filter(Boolean).join(' ') || undefined}
            title={iconOnly ? undefined : rest.title}
        >
            {/* 로딩 중에도 실행 내용을 표시한다. */}
            {leadingIcon}
            {children}
        </button>
    );
    const content = iconOnly && rest['aria-label'] ? <Tooltip title={rest['aria-label']}>{button}</Tooltip> : button;
    return unavailableReason ? <>{content}<span id={reasonId} className="reserve-sr-only">{unavailableReason}</span></> : content;
};

Button.propTypes = {
    variant: PropTypes.oneOf([
        'primary', 'secondary', 'ghost', 'ghost-sm', 'ghost-sm-primary',
        'ghost-sm-success', 'ghost-sm-danger', 'hero', 'outline', 'danger', 'link',
    ]),
    size: PropTypes.oneOf(['sm', 'md', 'lg', 'hero']),
    block: PropTypes.bool,
    loading: PropTypes.bool,
    disabled: PropTypes.bool,
    unavailableReason: PropTypes.string,
    onUnavailable: PropTypes.func,
    htmlType: PropTypes.oneOf(['button', 'submit', 'reset']),
    icon: PropTypes.node,
    loadingIcon: PropTypes.node,
    children: PropTypes.node,
    style: PropTypes.object,
    onClick: PropTypes.func,
    className: PropTypes.string,
};

export default Button;
