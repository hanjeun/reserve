/**
 * 약관 동의 UI 공통 스타일 토큰
 * Signup.jsx, SocialAgreement.jsx 공통 사용
 */
import { colors, fontSize, fontWeight } from './index';

export const agreement = {
    section:     { marginTop: 32 },
    divider:     { height: 1, background: colors.border.light, marginBottom: 20, marginTop: 0 },
    allRow:      { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14, userSelect: 'none' },
    allText:     { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text.primary, cursor: 'pointer' },
    itemRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' },
    itemLeft:    { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', flex: 1 },
    itemText:    { fontSize: fontSize.sm, color: colors.text.secondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
    requiredTag: { fontSize: 10, fontWeight: fontWeight.semibold, color: colors.primary.main, background: `${colors.primary.main}18`, borderRadius: 4, padding: '1px 6px', flexShrink: 0 },
    optionalTag: { fontSize: 10, fontWeight: fontWeight.semibold, color: colors.text.tertiary, background: colors.gray?.[100] || '#f5f5f5', borderRadius: 4, padding: '1px 6px', flexShrink: 0 },
    viewLink:    { background: 'none', border: 'none', cursor: 'pointer', fontSize: fontSize.xs, color: colors.text.tertiary, padding: '0 0 0 8px', flexShrink: 0, letterSpacing: '-0.2px' },
};
