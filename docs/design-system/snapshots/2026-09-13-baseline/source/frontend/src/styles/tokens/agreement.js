/**
 * 약관 동의 UI 공통 스타일 토큰
 * Signup.jsx, SocialAgreement.jsx 공통 사용
 */
// ★ 배럴('./index')이 아니라 원본 모듈에서 직접 가져온다.
//   index.js 가 이 파일을 re-export 하므로 './index' 를 쓰면 index → agreement → index 순환이 된다.
//   지금은 동작하지만 Rollup 이 "agreement 를 청크로 분리할 수 없다"고 경고하고,
//   청크가 갈리는 순간 초기화 순서가 꼬여 colors 가 undefined 인 채로 평가될 수 있다
//   (이 파일은 모듈 최상위에서 colors.* 를 읽어 객체를 만든다).
import { colors, withAlpha } from './colors';
import { fontSize, fontWeight } from './typography';

export const agreement = {
    section:     { marginTop: 32 },
    divider:     { height: 1, background: colors.border.light, marginBottom: 20, marginTop: 0 },
    allRow:      { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 14, userSelect: 'none' },
    allText:     { fontSize: fontSize.base, fontWeight: fontWeight.semibold, color: colors.text.primary, cursor: 'pointer' },
    itemRow:     { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' },
    itemLeft:    { display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', userSelect: 'none', flex: 1 },
    itemText:    { fontSize: fontSize.sm, color: colors.text.secondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 },
    requiredTag: { fontSize: 10, fontWeight: fontWeight.semibold, color: colors.primary.main, background: withAlpha(colors.primary.main), borderRadius: 4, padding: '1px 6px', flexShrink: 0 },
    optionalTag: { fontSize: 10, fontWeight: fontWeight.semibold, color: colors.text.tertiary, background: colors.gray?.[100] || '#f5f5f5', borderRadius: 4, padding: '1px 6px', flexShrink: 0 },
    viewLink:    { background: 'none', border: 'none', cursor: 'pointer', fontSize: fontSize.xs, color: colors.text.tertiary, padding: '0 0 0 8px', flexShrink: 0, letterSpacing: '-0.2px' },
};
