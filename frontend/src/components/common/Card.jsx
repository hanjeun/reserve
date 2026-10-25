/*
 * 이동 카드는 내부의 실제 Link를 사용하고 추가 카드는 실행 버튼으로 구분한다.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Card as AntCard } from 'antd';
// shadows 는 더 이상 쓰지 않는다 — 그림자 값은 index.css 의 "Card 그림자·hover" 블록에 있다.
import { colors, fontSize, fontWeight } from '../../styles/tokens';
import { getThumbnailUrl } from '../../utils';
import LoadingImage from './LoadingImage';

const Card = ({
    hoverable = false,
    actions,
    children,
    style,
    onClick,
    onKeyDown,
    role,
    tabIndex,
    className,
    ...rest
}) => {
    // boxShadow를 여기(인라인)에 두지 않는다 — hover 그림자가 죽는다.
    //   인라인 스타일은 클래스 규칙보다 우선이라, 인라인으로 box-shadow를 박으면
    //   AntD hoverable의 hover 그림자도, 아래 .reserve-card:hover 규칙도 전부 밀린다.
    //   실제로 그래서 "그림자 상승 + 이미지 줌"이라고 적어둔 관용구의 절반(그림자)이
    //   구현돼 있지 않았다. 그림자는 아래 <style>의 클래스 규칙이 담당한다.
    const cardStyle = {
        borderRadius: 0,
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
        ...style,
    };
    const isInteractive = typeof onClick === 'function';
    const cardClassName = [
        'reserve-card',
        isInteractive ? 'reserve-card--interactive' : '',
        className,
    ].filter(Boolean).join(' ');

    const handleKeyDown = (event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || !isInteractive) return;

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onClick(event);
        }
    };

    return (
        <>
            <AntCard
                {...rest}
                hoverable={hoverable}
                style={cardStyle}
                styles={{ body: { padding: 0 } }}
                actions={actions}
                onClick={onClick}
                onKeyDown={handleKeyDown}
                role={role ?? (isInteractive ? 'button' : undefined)}
                tabIndex={tabIndex ?? (isInteractive ? 0 : undefined)}
                className={cardClassName}
            >
                {children}
            </AntCard>
            {/*
             * 전역 카드 정책은 공통 CSS에 두며 인라인 그림자로 호버 규칙을 덮지 않는다.
             */}
        </>
    );
};

/*
 * width·height로 사진 공간을 예약하고 명시적 aspectRatio가 없으면 로딩 뒤 원본 비율을 따른다. 전역 클래스는 reserve- 접두사로 구분한다.
 */
// 사진 오류는 공통 대체 이미지로 한 번 교체한다.

const handleCoverError = (event) => {
    const fallback = getThumbnailUrl();
    if (event.currentTarget.src !== new URL(fallback, window.location.href).href) event.currentTarget.src = fallback;
};

Card.Cover = ({ src, alt, width, height, aspectRatio, imageClassName, referrerPolicy }) => (
    <div style={{ overflow: 'hidden', lineHeight: 0, margin: 0, aspectRatio }}>
        <LoadingImage
            alt={alt}
            src={src}
            loading="lazy"
            decoding="async"
            referrerPolicy={referrerPolicy}
            width={width}
            height={height}
            onError={handleCoverError}
            style={{ width: '100%', height: aspectRatio ? '100%' : 'auto', aspectRatio: aspectRatio ?? `auto ${width || 1} / ${height || 1}`, objectFit: 'cover', transition: 'transform 0.3s', display: 'block' }}
            className={['reserve-card-image', imageClassName].filter(Boolean).join(' ')}
        />
    </div>
);

/**
 * 카드 바디
 */
Card.Body = ({ children, style }) => {
    return (
        <div style={{ padding: '20px', ...style }}>
            {children}
        </div>
    );
};

/*
 * 추가 카드는 같은 목록 카드의 모서리 규칙을 따른다.
 */
Card.Add = ({ children, onClick, minHeight = '350px' }) => {
    const addCardStyle = {
        height: '100%',
        minHeight,
        borderRadius: 0,
        border: `2px dashed ${colors.border.light}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        backgroundColor: colors.background.subtle,
        color: colors.text.tertiary,
        transition: 'all 0.2s',
    };

    return (
        <button
            type="button"
            style={addCardStyle}
            onClick={onClick}
            className="reserve-card-add"
        >
            <span aria-hidden="true" style={{ fontSize: '40px', marginBottom: '10px' }}>+</span>
            <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold }}>
                {children}
            </span>
        </button>
    );
};

Card.propTypes = {
    hoverable: PropTypes.bool,
    actions: PropTypes.array,
    children: PropTypes.node,
    style: PropTypes.object,
    onClick: PropTypes.func,
    onKeyDown: PropTypes.func,
    role: PropTypes.string,
    tabIndex: PropTypes.number,
    className: PropTypes.string,
};

Card.Cover.propTypes = {
    src: PropTypes.string,
    alt: PropTypes.string,
    width: PropTypes.number,
    height: PropTypes.number,
    aspectRatio: PropTypes.number,
    imageClassName: PropTypes.string,
    referrerPolicy: PropTypes.string,
};

Card.Body.propTypes = {
    children: PropTypes.node,
    style: PropTypes.object,
};

Card.Add.propTypes = {
    children: PropTypes.node,
    onClick: PropTypes.func,
    minHeight: PropTypes.string,
};

export default Card;
