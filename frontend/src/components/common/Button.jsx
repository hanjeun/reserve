/**
 * RESERVE Design System - Button Component
 * 
 * variants:
 *   primary   - 파란 배경 (폼 제출)
 *   secondary - 회색 배경 (보조)
 *   ghost     - 투명 + 테두리 없음 (텍스트형)
 *   ghost-sm  - 텍스트형 소형 (취소, 리뷰쓰기 등 인라인 액션)
 *   hero      - 홈 히어로 버튼
 *   danger    - 위험 액션
 *   link      - 링크형
 */

import React from 'react';
import { colors, radius, heights, fontWeight, fontSize, shadows, transitions } from '../../styles/tokens';

const VARIANTS = {
    primary: {
        background: colors.primary.main,
        color: '#fff',
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
    // 테두리 없는 텍스트형 (취소, 리뷰쓰기, 리뷰보기 등)
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
        background: colors.primary.main,
        color: '#fff',
        border: 'none',
        borderRadius: radius.pill,
        boxShadow: shadows.buttonHover,
        padding: '0 40px',
    },
    outline: {
        background: 'transparent',
        color: colors.text.tertiary,
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
        background: colors.error?.main || '#ff4d4f',
        color: '#fff',
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
    sm:   heights.buttonSm,   // 36px
    md:   heights.buttonMd,   // 44px
    lg:   heights.buttonLg,   // 56px
    hero: heights.buttonHero, // 64px
};

const SIZE_FONT = {
    sm:   fontSize.sm,
    md:   fontSize.base,
    lg:   fontSize.lg,
    hero: '19px',
};

const Button = ({
    variant = 'primary',
    size = 'lg',
    block = false,
    loading = false,
    disabled = false,
    htmlType = 'button',
    icon,
    children,
    style,
    onClick,
    ...rest
}) => {
    const isGhostSm = variant.startsWith('ghost-sm');
    const isHero    = variant === 'hero';
    const isLink    = variant === 'link';

    const v = VARIANTS[variant] || VARIANTS.primary;

    const baseStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontWeight: isGhostSm ? fontWeight.medium : fontWeight.bold,
        fontSize: isGhostSm ? fontSize.sm : isHero ? '19px' : SIZE_FONT[size],
        height: isGhostSm || isLink ? 'auto' : isHero ? heights.buttonHero : SIZE_HEIGHT[size],
        width: block ? '100%' : undefined,
        transition: `all ${transitions.fast} ${transitions.easing}`,
        userSelect: 'none',
        outline: 'none',
        // ghost-sm은 패딩 최소화
        padding: isGhostSm ? '2px 0' : undefined,
        ...v,
        ...style,
    };

    const handleClick = (e) => {
        if (disabled || loading) return;
        onClick?.(e);
    };

    return (
        <>
            <button
                type={htmlType}
                disabled={disabled || loading}
                onClick={handleClick}
                className={`reserve-btn reserve-btn--${variant}`}
                style={baseStyle}
                {...rest}
            >
                {loading ? (
                    <span style={spinStyle} className="reserve-btn-spin" />
                ) : (
                    <>
                        {icon && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '0.9em' }}>{icon}</span>
                        )}
                        {children}
                    </>
                )}
            </button>
            <style>{`
                .reserve-btn {
                    -webkit-appearance: none;
                    appearance: none;
                }
                /* primary / secondary / danger / hero: scale + opacity */
                .reserve-btn--primary:active:not(:disabled),
                .reserve-btn--secondary:active:not(:disabled),
                .reserve-btn--danger:active:not(:disabled),
                .reserve-btn--hero:active:not(:disabled) {
                    transform: scale(0.96);
                    opacity: 0.88;
                }
                .reserve-btn--primary:hover:not(:disabled) { opacity: 0.9; }
                .reserve-btn--secondary:hover:not(:disabled) { opacity: 0.85; }
                .reserve-btn--hero:hover:not(:disabled) { opacity: 0.92; box-shadow: 0 12px 24px rgba(49,130,246,0.28); }

                /* ghost-sm: 텍스트 색 살짝 어두워지며 눌리는 느낌 */
                .reserve-btn--ghost-sm:hover:not(:disabled)         { opacity: 0.7; }
                .reserve-btn--ghost-sm:active:not(:disabled)        { opacity: 0.5; transform: scale(0.95); }
                .reserve-btn--ghost-sm-primary:hover:not(:disabled) { opacity: 0.7; }
                .reserve-btn--ghost-sm-primary:active:not(:disabled){ opacity: 0.5; transform: scale(0.95); }
                .reserve-btn--ghost-sm-success:hover:not(:disabled) { opacity: 0.7; }
                .reserve-btn--ghost-sm-success:active:not(:disabled){ opacity: 0.5; transform: scale(0.95); }
                .reserve-btn--ghost-sm-danger:hover:not(:disabled)  { opacity: 0.7; }
                .reserve-btn--ghost-sm-danger:active:not(:disabled) { opacity: 0.5; transform: scale(0.95); }

                /* ghost / link */
                .reserve-btn--outline:hover:not(:disabled) { border-color: #adb5bd; color: #6c757d; }
                .reserve-btn--outline:active:not(:disabled) { transform: scale(0.96); opacity: 0.88; }
                .reserve-btn--ghost:hover:not(:disabled) { opacity: 0.7; }
                .reserve-btn--ghost:active:not(:disabled) { opacity: 0.5; transform: scale(0.94); }
                .reserve-btn--link:hover:not(:disabled) { opacity: 0.75; }

                /* 스피너 */
                .reserve-btn-spin {
                    display: inline-block;
                    width: 14px; height: 14px;
                    border: 2px solid rgba(255,255,255,0.4);
                    border-top-color: #fff;
                    border-radius: 50%;
                    animation: reserve-spin 0.6s linear infinite;
                }
            `}</style>
        </>
    );
};

const spinStyle = {};

export default Button;
