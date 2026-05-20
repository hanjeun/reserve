/**
 * RESERVE Design System - Component Styles
 * 
 * 📌 버튼 스타일 통일 가이드:
 * - 모든 폼 제출 버튼: height=buttonLg(56px), borderRadius=xl(16px), border='none'
 * - 홈 히어로 버튼만 예외: height=buttonHero(64px), boxShadow=buttonHover
 * - Input: variant="filled", border='none'
 */

import { colors } from './colors';
import { radius, shadows, heights } from './spacing';
import { fontWeight, fontSize } from './typography';

// ============================================
// Button Styles (통일됨)
// ============================================
export const button = {
  // 기본 제출 버튼 (Login, Signup, StoreRegister, StoreEdit, StoreDetail)
  primary: {
    backgroundColor: colors.primary.main,
    color: '#fff',
    border: 'none',
    borderRadius: radius.xl,
    height: heights.buttonLg,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
  },
  // 홈 히어로 버튼 (Home 페이지 전용)
  hero: {
    backgroundColor: colors.primary.main,
    color: '#fff',
    border: 'none',
    borderRadius: radius.xl,
    height: heights.buttonHero,
    padding: '0 40px',
    fontSize: '19px',
    fontWeight: fontWeight.bold,
    boxShadow: shadows.buttonHover,
  },
  // 취소/보조 버튼 (StoreEdit)
  cancel: {
    backgroundColor: colors.gray[100],
    color: colors.text.secondary,
    border: 'none',
    borderRadius: radius.xl,
    height: heights.buttonLg,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  // 중간 크기 버튼 (MyStores addBtn)
  medium: {
    backgroundColor: colors.primary.main,
    color: '#fff',
    border: 'none',
    borderRadius: radius.lg,
    height: heights.buttonMd,
    fontWeight: fontWeight.bold,
  },
  // 작은 버튼 (MyStores editBtn)
  small: {
    backgroundColor: colors.primary.main,
    color: '#fff',
    border: 'none',
    borderRadius: radius.lg,
    height: heights.buttonSm,
    fontWeight: fontWeight.semibold,
    boxShadow: shadows.card,
  },
  // 뒤로가기 버튼 (StoreDetail)
  back: {
    border: 'none',
    background: 'none',
    color: colors.text.tertiary,
    padding: 0,
  },
  // 헤더 네비게이션 버튼
  nav: {
    backgroundColor: 'transparent',
    color: colors.text.secondary,
    border: 'none',
    borderRadius: radius.md,
    height: heights.buttonMd,
    fontWeight: fontWeight.semibold,
  },
  // 헤더 액션 버튼 (시작하기)
  action: {
    backgroundColor: colors.primary.main,
    color: '#fff',
    border: 'none',
    borderRadius: radius.md,
    height: heights.buttonMd,
    padding: '0 20px',
    fontWeight: fontWeight.semibold,
  },
};

// ============================================
// Input Styles (통일됨)
// ============================================
export const input = {
  // 기본 입력 필드 (variant="filled", border 없음)
  default: {
    backgroundColor: colors.gray[50],
    border: 'none',
    borderRadius: radius.lg,
    height: heights.input,
  },
  // 비활성화 입력 필드 (StoreEdit - 가게 이름)
  disabled: {
    backgroundColor: colors.gray[100],
    color: colors.text.tertiary,
    cursor: 'not-allowed',
    borderRadius: radius.md,
  },
  // 좌측 결합 입력 필드 (Signup - 이메일)
  left: {
    backgroundColor: colors.gray[50],
    border: 'none',
    borderRadius: `${radius.lg} 0 0 ${radius.lg}`,
    height: heights.input,
    flex: 1,
  },
  // 우측 결합 버튼 (Signup - 인증)
  rightButton: {
    borderRadius: `0 ${radius.lg} ${radius.lg} 0`,
    height: heights.input,
    fontWeight: fontWeight.bold,
    padding: '0 20px',
    border: 'none',
    backgroundColor: colors.gray[100],
    fontSize: fontSize.md,
  },
};

// ============================================
// Card Styles
// ============================================
export const card = {
  default: {
    backgroundColor: colors.background.paper,
    border: `1px solid ${colors.border.light}`,
    borderRadius: radius['2xl'],
    boxShadow: shadows.card,
    padding: '20px',
  },
  hoverable: {
    backgroundColor: colors.background.paper,
    border: `1px solid ${colors.border.light}`,
    borderRadius: radius['2xl'],
    boxShadow: shadows.card,
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
};

// ============================================
// Badge Styles
// ============================================
export const badge = {
  primary: {
    color: colors.primary.main,
    backgroundColor: colors.primary.light,
    borderRadius: radius['2xl'],
    padding: '4px 12px',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  success: {
    color: colors.success.main,
    backgroundColor: colors.success.light,
    borderRadius: radius['2xl'],
    padding: '4px 12px',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  error: {
    color: colors.error.main,
    backgroundColor: colors.error.light,
    borderRadius: radius['2xl'],
    padding: '4px 12px',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  pill: {
    backgroundColor: colors.gray[100],
    color: colors.primary.main,
    borderRadius: radius.pill,
    padding: '8px 20px',
    fontWeight: fontWeight.bold,
    fontSize: fontSize.base,
  },
};

// ============================================
// Header Styles
// ============================================
export const header = {
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    backdropFilter: 'blur(20px)',
    borderBottom: `1px solid ${colors.border.light}`,
    height: heights.header,
    padding: '0 24px',
  },
  logo: {
    fontSize: '22px',
    fontWeight: 850,
    color: colors.primary.main,
    letterSpacing: '-0.8px',
  },
};

// ============================================
// Avatar Styles
// ============================================
export const avatar = {
  default: {
    backgroundColor: colors.primary.main,
    color: '#fff',
    boxShadow: shadows.avatar,
  },
};

// ============================================
// Suspend Banner Styles — Header 제재 배너
// ============================================
export const suspendBanner = {
  base: {
    color: '#fff',
    textAlign: 'center',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 500,
    position: 'sticky',
    top: heights.header,
    zIndex: 999,
    lineHeight: 1.5,
  },
  suspended: {
    backgroundColor: '#fa8c16', // 주황 — 기간 정지
  },
  banned: {
    backgroundColor: '#ff4d4f', // 빨강 — 영구 정지
  },
};

// ============================================
// Agreement (약관 동의) Styles — Signup 전용
// Toss/Kakao 스타일: 박스 없이 체크박스 + 텍스트 태그
// ============================================
export const agreement = {
  section: {
    marginTop: 32,
  },
  divider: {
    height: 1,
    background: '#f0f0f0',
    marginBottom: 20,
  },
  allRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    cursor: 'pointer',
    marginBottom: 16,
    userSelect: 'none',
  },
  allText: {
    fontWeight: '600',
    fontSize: '15px',
    color: '#111',
    cursor: 'pointer',
    lineHeight: 1,
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '3px 0',
  },
  itemLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
    userSelect: 'none',
    flex: 1,
  },
  itemText: {
    fontSize: '13px',
    color: '#555',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  requiredTag: {
    fontSize: '11px',
    fontWeight: '600',
    color: colors.primary.main,
    letterSpacing: '-0.2px',
  },
  optionalTag: {
    fontSize: '11px',
    fontWeight: '500',
    color: '#aaa',
    letterSpacing: '-0.2px',
  },
  viewLink: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#aaa',
    padding: '2px 0 2px 8px',
    flexShrink: 0,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    transition: 'color 0.15s',
  },
};

// ============================================
// Footer Legal Styles
// ============================================
export const footerLegal = {
  wrapper: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 8,
  },
  leftBlock: {
    fontSize: '12px',
    color: '#aaa',
    lineHeight: 1.8,
  },
  rightBlock: {
    fontSize: '12px',
    color: '#aaa',
    textAlign: 'right',
    lineHeight: 1.8,
  },
};

// ============================================
// Form Section Styles
// ============================================
export const formSection = {
  existingImage: {
    marginBottom: '24px',
    padding: '16px',
    backgroundColor: colors.gray[50],
    borderRadius: radius.lg,
  },
};
