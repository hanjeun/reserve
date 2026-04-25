import { colors, fontWeight, radius, shadows, heights, transitions, fontSize } from '../../styles/tokens';

export const styles = {
    homeWrapper: {
        backgroundColor: colors.background.default,
        overflowX: 'hidden',
    },
    contentArea: {
        minHeight: `calc(100dvh - ${heights.header})`,
        padding: '0 24px',
        gap: 0,
        position: 'relative',
        boxSizing: 'border-box',
    },
    badge: {
        backgroundColor: colors.gray[100],
        padding: '6px 16px',
        borderRadius: radius.pill,
        color: colors.primary.main,
        fontWeight: fontWeight.bold,
        marginBottom: 28,
        fontSize: 14,
    },
    titleContainer: { marginBottom: 20 },
    mainTitle: {
        fontSize: 'clamp(36px, 6vw, 64px)',
        fontWeight: fontWeight.extrabold,
        color: colors.text.primary,
        textAlign: 'center',
        lineHeight: 1.3,
        margin: 0,
        letterSpacing: '-1px',
    },
    lineWrapper: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '1.35em',
        whiteSpace: 'pre',
    },
    subTitle: {
        fontSize: 'clamp(15px, 2.5vw, 18px)',
        color: colors.text.secondary,
        textAlign: 'center',
        lineHeight: 1.7,
        fontWeight: fontWeight.medium,
        display: 'block',
    },
    heroBtn: {
        height: heights.buttonHero,
        padding: '0 44px',
        fontSize: 18,
        fontWeight: fontWeight.bold,
        borderRadius: radius.pill,
        boxShadow: shadows.buttonHover,
        border: 'none',
        backgroundColor: colors.primary.main,
        color: '#fff',
        display: 'inline-flex',
        alignItems: 'center',
        transition: `all ${transitions.fast} ${transitions.easing}`,
        cursor: 'pointer',
    },

    // ── PC 섹션 ──
    section: {
        minHeight: `calc(100dvh - ${heights.header})`,
        scrollMarginTop: heights.header,
        padding: '0 24px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        position: 'relative',
        boxSizing: 'border-box',
    },
    sectionBody: {
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    },
    sectionInner: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 80,
        maxWidth: 1000,
        width: '100%',
        margin: '0 auto',
        flexWrap: 'wrap',
    },
    sectionText: { flex: '1 1 340px', maxWidth: 420 },
    sectionUI: { flex: '1 1 300px', display: 'flex', justifyContent: 'center' },

    // ── 모바일 섹션 ──
    sectionMobile: {
        minHeight: `calc(100dvh - ${heights.header})`,
        scrollMarginTop: heights.header,
        padding: '32px 20px 32px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        boxSizing: 'border-box',
        position: 'relative',
    },
    sectionBodyMobile: {
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
    },
    sectionTextMobile: { width: '100%' },
    sectionTitleMobile: {
        fontSize: 'clamp(22px, 6vw, 32px)',
        fontWeight: fontWeight.extrabold,
        color: colors.text.primary,
        lineHeight: 1.3,
        letterSpacing: '-0.5px',
        margin: '0 0 12px',
    },

    // ── 공통 화살표 ──
    sectionArrow: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
    },

    // ── 공통 태그/포인트 ──
    sectionTag: {
        display: 'inline-block',
        background: `${colors.primary.main}18`,
        color: colors.primary.main,
        fontWeight: fontWeight.bold,
        fontSize: 13,
        padding: '4px 12px',
        borderRadius: radius.pill,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 'clamp(26px, 4vw, 40px)',
        fontWeight: fontWeight.extrabold,
        color: colors.text.primary,
        lineHeight: 1.3,
        letterSpacing: '-0.5px',
        margin: '0 0 14px',
    },
    pointList: { display: 'flex', flexDirection: 'column', gap: 10 },
    pointRow: { display: 'flex', alignItems: 'center', gap: 10 },
};

// 목업 공통 스타일
export const mockInputBase = {
    display: 'flex',
    alignItems: 'center',
    height: heights.input,
    background: colors.gray[50],
    borderRadius: radius.lg,
    padding: '0 16px',
    fontSize: '14px',
    color: colors.text.primary,
    boxSizing: 'border-box',
    border: 'none',
};

export const mockFormLabel = {
    display: 'block',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text.primary,
    marginBottom: 8,
    paddingLeft: 4,
};
