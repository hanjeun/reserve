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
// shadows 는 더 이상 쓰지 않는다 — 그림자 값은 index.css 의 "Card 그림자·hover" 블록에 있다.
import { colors, fontSize, fontWeight } from '../../styles/tokens';

const Card = ({ 
    hoverable = false,
    actions,
    children,
    style,
    onClick,
    ...rest 
}) => {
    // ★ boxShadow를 여기(인라인)에 두지 않는다 — hover 그림자가 죽는다.
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
            {/* 그림자·hover·actions 줄 CSS 는 index.css 의 "Card 그림자·hover" 블록으로 옮겼다.
                JSX 안 <style> 은 인스턴스마다 렌더돼서, 카드가 수십 개인 목록 화면에서
                동일한 태그가 그만큼 쌓였다. 전역 정책은 index.css — CLAUDE.md 설계 원칙 참고.
                ★ 이 컴포넌트를 쓰는 쪽에서 인라인 boxShadow 를 주면 hover 그림자가 죽는다. */}
        </>
    );
};

/**
 * 카드 커버 이미지.
 * width/height props are passed through as real HTML attributes on <img> — browsers use
 * these to reserve the correct aspect-ratio space before the image resource even loads,
 * preventing layout shift independently of any skeleton (supported in all modern browsers).
 * mainImageWidth/Height가 없으면 그냥 생략되고 지금과 동일하게 동작함.
 *
 * className은 `reserve-` 접두사를 지킨다. 전역 CSS라, 접두사 없는 이름(예전 'card-image')은
 * 다른 라이브러리나 목업 컴포넌트와 충돌할 여지가 있었다.
 */
Card.Cover = ({ src, alt, width, height }) => (
    <div style={{ overflow: 'hidden', lineHeight: 0, margin: 0 }}>
        <img
            alt={alt}
            src={src}
            width={width}
            height={height}
            style={{ width: '100%', height: 'auto', objectFit: 'cover', transition: 'transform 0.3s', display: 'block' }}
            className="reserve-card-image"
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
