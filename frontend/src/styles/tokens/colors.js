/**
 * RESERVE Design System - Colors
 * 현재 RESERVE 프로젝트에서 실제 사용 중인 컬러 값 기반
 */

export const colors = {
  // Primary - 메인 브랜드 컬러
  primary: {
    main: '#3182f6',
    light: '#e8f3ff',
    dark: '#2272eb',
  },

  // Gray Scale - 텍스트 & 배경
  gray: {
    50: '#f9fafb',   // 인풋 배경
    100: '#f2f4f6',  // 테두리, 구분선
    200: '#e5e8eb',
    300: '#d1d6db',
    400: '#b5b8bd',
    500: '#8b95a1',  // 보조 텍스트 (tertiary)
    600: '#6b7684',
    700: '#4e5968',  // 본문 텍스트 (secondary)
    800: '#333d4b',
    900: '#1a1f27',  // 제목 텍스트 (primary)
  },

  // Semantic Colors
  success: { main: '#00c73c', light: '#e8f9ee' },
  error: { main: '#f04452', light: '#fff0f1' },
  warning: { main: '#ffb800', light: '#fff8e6' },

  // Background
  background: {
    default: '#ffffff',
    subtle: '#f8f9fa',
    paper: '#ffffff',
  },

  // Text (시맨틱)
  text: {
    primary: '#1a1f27',
    secondary: '#4e5968',
    tertiary: '#8b95a1',
    disabled: '#b5b8bd',
  },

  // Border
  border: {
    light: '#f2f4f6',
    default: '#e5e8eb',
  },
};

// 단축 export
export const primary = colors.primary.main;
export const textPrimary = colors.text.primary;
export const textSecondary = colors.text.secondary;
export const textTertiary = colors.text.tertiary;
