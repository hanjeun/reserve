/**
 * RESERVE Design System - Theme (참고용)
 * 
 * 나중에 Ant Design ConfigProvider에 적용할 때 사용
 * 현재는 적용하지 않음 - 기존 스타일 유지
 */

import { colors } from './tokens/colors';

export const theme = {
  token: {
    colorPrimary: colors.primary.main,
    colorSuccess: colors.success.main,
    colorWarning: colors.warning.main,
    colorError: colors.error.main,
    colorText: colors.text.primary,
    colorTextSecondary: colors.text.secondary,
    fontFamily: '"Pretendard Variable", Pretendard, -apple-system, sans-serif',
  },
};

export default theme;
