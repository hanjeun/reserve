/**
 * RESERVE Design System - Card Component
 * 
 * 사용법:
 * <Card hoverable onClick={() => navigate('/store/1')}>
 *     <Card.Cover src={imageUrl} alt="가게 이미지" />
 *     <Card.Body>내용</Card.Body>
 * </Card>
 * 
 * <Card.Add onClick={() => navigate('/store/register')}>
 *     새 가게 등록하기
 * </Card.Add>
 */

import React from 'react';
import PropTypes from 'prop-types';
import { Card as AntCard } from 'antd';
import { colors, shadows, fontSize, fontWeight } from '../../styles/tokens';

const Card = ({ 
    hoverable = false,
    actions,
    children,
    style,
    onClick,
    ...rest 
}) => {
    const cardStyle = {
        borderRadius: 0,
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
        boxShadow: shadows.card,
        ...style,
    };

    return (
        <>
            <AntCard
                hoverable={hoverable}
                style={cardStyle}
                styles={{ body: { padding: 0 } }}
                actions={actions}
                onClick={onClick}
                className="reserve-card"
                {...rest}
            >
                {children}
            </AntCard>
            <style>{`
                .reserve-card:hover .card-image {
                    transform: scale(1.05);
                }
                .reserve-card .ant-card-actions {
                    background: #fff !important;
                    border-top: 1px solid ${colors.border.light};
                }
                .reserve-card .ant-card-actions > li {
                    margin: 12px 0 !important;
                }
            `}</style>
        </>
    );
};

/**
 * 카드 커버 이미지.
 * width/height props are passed through as real HTML attributes on <img> — browsers use
 * these to reserve the correct aspect-ratio space before the image resource even loads,
 * preventing layout shift independently of any skeleton (supported in all modern browsers).
 * mainImageWidth/Height가 없으면 그냥 생략되고 지금과 동일하게 동작함.
 */
Card.Cover = ({ src, alt, width, height }) => (
    <div style={{ overflow: 'hidden', lineHeight: 0, margin: 0 }}>
        <img
            alt={alt}
            src={src}
            width={width}
            height={height}
            style={{ width: '100%', height: 'auto', objectFit: 'cover', transition: 'transform 0.3s', display: 'block' }}
            className="card-image"
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

/**
 * 추가 카드 (새 가게 등록 등)
 * 2026-07 수정 — borderRadius를 실제 Card(각진 사각형, radius 0)와 맞춤.
 * 예전엔 radius['2xl']이라 옆에 나란히 놓이는 실제 가게 카드와 모서리가 안 맞았다.
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
        <div 
            style={addCardStyle}
            onClick={onClick}
            className="reserve-card-add"
        >
            <span style={{ fontSize: '40px', marginBottom: '10px' }}>+</span>
            <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.semibold }}>
                {children}
            </span>
            <style>{`
                .reserve-card-add:hover {
                    border-color: ${colors.primary.main};
                    color: ${colors.primary.main};
                }
            `}</style>
        </div>
    );
};

Card.propTypes = {
    hoverable: PropTypes.bool,
    actions: PropTypes.array,
    children: PropTypes.node,
    style: PropTypes.object,
    onClick: PropTypes.func,
};

Card.Cover.propTypes = {
    src: PropTypes.string,
    alt: PropTypes.string,
    width: PropTypes.number,
    height: PropTypes.number,
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
