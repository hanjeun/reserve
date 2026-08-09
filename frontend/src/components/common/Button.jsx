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
import PropTypes from 'prop-types';
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
        // 2026-07: 예전엔 text.tertiary(연회색)라 같은 "모달 취소 버튼"인데도 AntD 기본 버튼
        // (진한 텍스트)과 색이 달라 보였다. 모달 취소는 "그냥 장식"이 아니라 사용자가 실제로
        // 누를 수 있어야 하는 동등한 선택지이므로 본문과 같은 진한 색이 맞다.
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
    sm:   heights.buttonSm,
    md:   heights.buttonMd,
    lg:   heights.buttonLg,
    hero: heights.buttonHero,
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

    // 중첩 삼항 대신 if/else로 추출 (SonarCloud: no nested ternary)
    let buttonHeight;
    if (isGhostSm || isLink) buttonHeight = 'auto';
    else if (isHero)          buttonHeight = heights.buttonHero;
    else                      buttonHeight = SIZE_HEIGHT[size];

    let buttonFontSize;
    if (isGhostSm)   buttonFontSize = fontSize.sm;
    else if (isHero) buttonFontSize = '19px';
    else             buttonFontSize = SIZE_FONT[size];

    const baseStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        fontWeight: isGhostSm ? fontWeight.medium : fontWeight.bold,
        fontSize: buttonFontSize,
        height: buttonHeight,
        width: block ? '100%' : undefined,
        transition: `all ${transitions.fast} ${transitions.easing}`,
        userSelect: 'none',
        outline: 'none',
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
        </>
    );
};
/* hover·active 등 상호작용 CSS 는 index.css 의 "Button 상호작용 상태" 블록에 있다.
   예전에는 이 파일 안의 <style> 태그였는데, JSX 안의 style 은 **인스턴스마다 렌더**되어
   버튼이 많은 화면에서 동일한 태그가 수십 개 쌓였다(실측: 마이페이지에서 3개).
   전역 정책은 index.css 로 — CLAUDE.md "설계 원칙" 참고. */

const spinStyle = {};

Button.propTypes = {
    variant: PropTypes.oneOf([
        'primary', 'secondary', 'ghost', 'ghost-sm', 'ghost-sm-primary',
        'ghost-sm-success', 'ghost-sm-danger', 'hero', 'outline', 'danger', 'link',
    ]),
    size: PropTypes.oneOf(['sm', 'md', 'lg', 'hero']),
    block: PropTypes.bool,
    loading: PropTypes.bool,
    disabled: PropTypes.bool,
    htmlType: PropTypes.oneOf(['button', 'submit', 'reset']),
    icon: PropTypes.node,
    children: PropTypes.node,
    style: PropTypes.object,
    onClick: PropTypes.func,
};

export default Button;
