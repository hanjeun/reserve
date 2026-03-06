import React from 'react';
import { colors } from '../../styles/tokens';

/**
 * RESERVE Design System - Loading Spinner
 *
 * 버튼 스피너와 동일한 디자인 언어 — 미니멀 링 스피너
 * (reserve-spin 키프레임은 App.jsx에서 전역 주입)
 *
 * props:
 *   fullPage  {boolean} - true: 전체화면 중앙 고정 (앱 초기화용)
 *                         false: 컨테이너 내부 중앙 (기본, 페이지 섹션용)
 *   size      {number}  - 링 크기 px (기본 36)
 *   thickness {number}  - 선 굵기 px (기본 3)
 *   color     {string}  - 링 색상 (기본 primary.main)
 *   minHeight {string}  - fullPage=false일 때 최소 높이 (기본 '240px')
 */
const Loading = ({
  fullPage  = false,
  size      = 36,
  thickness = 3,
  color     = colors.primary.main,
  minHeight = '240px',
}) => {
  const ring = (
    <div
      style={{
        width:          size,
        height:         size,
        borderRadius:   '50%',
        border:         `${thickness}px solid ${colors.gray[100]}`,
        borderTopColor: color,
        boxSizing:      'border-box',
        animation:      'reserve-spin 0.7s linear infinite',
        flexShrink:     0,
      }}
    />
  );

  if (fullPage) {
    return (
      <div
        style={{
          position:        'fixed',
          inset:           0,
          display:         'flex',
          justifyContent:  'center',
          alignItems:      'center',
          backgroundColor: colors.background.default,
          zIndex:          9999,
        }}
      >
        {ring}
      </div>
    );
  }

  return (
    <div
      style={{
        display:        'flex',
        justifyContent: 'center',
        alignItems:     'center',
        minHeight,
        width:          '100%',
      }}
    >
      {ring}
    </div>
  );
};

export default Loading;
