/**
 * RESERVE Design System - PageContainer Component
 * 
 * 사용법:
 * <PageContainer size="sm">로그인 폼</PageContainer>
 * <PageContainer size="md" paddingTop="20px">상세 페이지</PageContainer>
 * <PageContainer size="xl">목록 페이지</PageContainer>
 */

import React from 'react';
import PropTypes from 'prop-types';
import { colors, maxWidth as maxWidthTokens, heights } from '../../styles/tokens';

const PageContainer = ({ 
    size = 'md',
    paddingTop = '40px',
    paddingBottom = '80px',
    paddingX = '24px',
    center = false,
    backgroundColor = colors.background.default,
    children,
    style,
    ...rest 
}) => {
    // size별 maxWidth 매핑
    const sizeMap = {
        sm: maxWidthTokens.sm,   // 420px - 폼 페이지
        md: maxWidthTokens.md,   // 700px - 상세 페이지
        lg: maxWidthTokens.lg,   // 1000px - 관리 페이지
        xl: maxWidthTokens.xl,   // 1200px - 목록 페이지
    };

    const containerStyle = {
        width: '100%',
        maxWidth: sizeMap[size] || sizeMap.md,
        margin: '0 auto',
        padding: `${paddingTop} ${paddingX} ${paddingBottom}`,
        backgroundColor,
        textAlign: center ? 'center' : 'left',
        // 헤더 높이를 뺀 최소 높이. 단위는 svh — dvh는 모바일에서 주소창이 접힐 때 값이 커져서
        // minHeight가 함께 늘어나고, 그만큼 콘텐츠 아래로 빈 여백이 벌어진다(FaqSection에서 겪은 것과 같은 문제).
        // 홈 섹션들도 전부 svh 기준이라 단위를 통일한다. 헤더 높이는 heights.header 토큰에서 가져온다(하드코딩 금지).
        minHeight: `calc(100svh - ${heights.header})`,
        ...style,
    };

    // reserve-page-container: 359px 이하에서만 좌우 패딩을 줄이는 CSS 훅(index.css).
    // 인라인 스타일로는 미디어쿼리를 걸 수 없어 클래스로 뺐다.
    return (
        <div className="reserve-page-container" style={containerStyle} {...rest}>
            {children}
        </div>
    );
};

PageContainer.propTypes = {
    size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
    paddingTop: PropTypes.string,
    paddingBottom: PropTypes.string,
    paddingX: PropTypes.string,
    center: PropTypes.bool,
    backgroundColor: PropTypes.string,
    children: PropTypes.node,
    style: PropTypes.object,
};

export default PageContainer;
