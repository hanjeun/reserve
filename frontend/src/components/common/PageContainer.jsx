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
import { colors, maxWidth as maxWidthTokens } from '../../styles/tokens';

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
        minHeight: 'calc(100dvh - 64px)', // header 높이 제외 (dvh: 모바일 주소창 고려)
        ...style,
    };

    return (
        <div style={containerStyle} {...rest}>
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
