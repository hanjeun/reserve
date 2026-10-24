/**
 * 공용 색 토큰은 theme.css의 CSS 변수를 참조해 모듈 수준 스타일도 테마 전환을 따르게 한다.
 * canvas·JS 색 계산처럼 CSS 변수를 해석하지 않는 API에는 실제 색상값을 사용해야 한다.
 * rawColors는 고정 팔레트이므로 테마에 따라 바뀌는 값과 구분한다.
 */

import { surfaceForWhiteText } from '../../utils/colorContrast';

const v = (name, fallback) => `var(--c-${name}, ${fallback})`;
const solidAction = (main, hover) => ({ main, foreground: '#ffffff',
  solid: surfaceForWhiteText(main), solidHover: surfaceForWhiteText(hover) });

/** CSS variables and AntD use the same literal semantic action palette. */
export const semanticActionPalettes = {
  light: { error: solidAction('#f04452', '#d93644'), success: solidAction('#00c73c', '#00a332') },
  dark: { error: solidAction('#ff6b76', '#f04452'), success: solidAction('#32d365', '#00c73c') },
};

export const colors = {
  // Primary - 메인 브랜드 컬러
  primary: {
    main:  v('primary', '#3182f6'),
    light: v('primary-light', '#e8f3ff'),
    dark:  v('primary-dark', '#2272eb'),
    foreground: v('primary-fg', '#ffffff'),
    solid: v('primary-solid', '#1b64da'),
    solidHover: v('primary-solid-hover', '#1b64da'),
  },

  // Gray Scale - 텍스트 & 배경
  gray: {
    50:  v('gray-50', '#f9fafb'),   // 인풋 배경
    100: v('gray-100', '#f2f4f6'),  // 테두리, 구분선
    200: v('gray-200', '#e5e8eb'),
    300: v('gray-300', '#d1d6db'),
    400: v('gray-400', '#b5b8bd'),
    500: v('gray-500', '#8b95a1'),  // 보조 텍스트 (tertiary)
    600: v('gray-600', '#6b7684'),
    700: v('gray-700', '#4e5968'),  // 본문 텍스트 (secondary)
    800: v('gray-800', '#333d4b'),
    900: v('gray-900', '#1a1f27'),  // 제목 텍스트 (primary)
  },

  // Semantic Colors
  success: { main: v('success', '#00c73c'), light: v('success-light', '#e8f9ee'), foreground: v('success-fg', '#ffffff'),
    solid: v('success-solid', semanticActionPalettes.light.success.solid), solidHover: v('success-solid-hover', semanticActionPalettes.light.success.solidHover) },
  error:   { main: v('error', '#f04452'),   light: v('error-light', '#fff0f1'), foreground: v('error-fg', '#ffffff'),
    solid: v('error-solid', semanticActionPalettes.light.error.solid), solidHover: v('error-solid-hover', semanticActionPalettes.light.error.solidHover) },
  warning: { main: v('warning', '#ffb800'), light: v('warning-light', '#fff8e6') },

  // Background
  background: {
    default: v('bg-default', '#ffffff'),
    subtle:  v('bg-subtle', '#f8f9fa'),
    paper:   v('bg-paper', '#ffffff'),
    overlay: v('bg-overlay', 'rgba(255, 255, 255, 0.92)'),
  },

  // Text (시맨틱)
  text: {
    primary:   v('text-primary', '#1a1f27'),
    secondary: v('text-secondary', '#4e5968'),
    tertiary:  v('text-tertiary', '#8b95a1'),
    disabled:  v('text-disabled', '#b5b8bd'),
    // 입력칸의 placeholder·비활성 글자. AntD의 colorTextPlaceholder/colorTextDisabled와 같은 값이라
    // AntD가 아닌 **직접 만든 입력 UI**도 이걸 쓰면 AntD 입력과 톤이 정확히 맞는다.
    // (theme.css의 --c-input-disabled-fg는 예전부터 있었는데 여기 노출이 안 돼서
    //  StoreDetail의 TimeSlotPicker가 rgba(0,0,0,0.25)를 하드코딩했고, 다크에서 글자가 안 보였다)
    placeholder: v('input-disabled-fg', 'rgba(0, 0, 0, 0.25)'),
  },

  // Border
  border: {
    light:   v('border-light', '#f2f4f6'),
    default: v('border-default', '#e5e8eb'),
  },
};

/**
 * 실제 hex 값. **테마를 따라가지 않는다** — 라이트 모드 기준 고정값이다.
 * canvas·차트 라이브러리·JS 색 연산처럼 CSS 변수를 해석할 수 없는 자리에만 쓴다.
 * 일반 스타일에는 위 `colors`를 쓸 것.
 */
export const rawColors = {
  primary: '#3182f6',
  gray: {
    50: '#f9fafb', 100: '#f2f4f6', 200: '#e5e8eb', 300: '#d1d6db', 400: '#b5b8bd',
    500: '#8b95a1', 600: '#6b7684', 700: '#4e5968', 800: '#333d4b', 900: '#1a1f27',
  },
  success: '#00c73c',
  error: '#f04452',
  warning: '#ffb800',
};

// 단축 export
export const primary = colors.primary.main;
export const textPrimary = colors.text.primary;
export const textSecondary = colors.text.secondary;
export const textTertiary = colors.text.tertiary;

/**
 * CSS 변수에도 유효한 color-mix로 투명도를 섞는다. hex 알파 문자열을 뒤에 붙이지 않는다.
 * @param {string} color CSS 색 또는 색 토큰
 * @param {number} pct 불투명도 백분율
 */
export const withAlpha = (color, pct = 12) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
