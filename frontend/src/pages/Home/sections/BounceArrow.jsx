import { colors } from '../../../styles/tokens';

/*
 * 섹션의 scroll-margin-top으로 고정 헤더 높이를 보정한다.
 */
const scrollToSection = (id, prefersReducedMotion) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
};

export default function BounceArrow({ targetId, style = {}, prefersReducedMotion = false }) {
    return (
        <button
            type="button"
            className="bounce-arrow"
            aria-label="다음 섹션으로 이동"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center', width: '100%', boxSizing: 'border-box', padding: '12px 0', background: 'transparent', border: 0, ...style }}
            onClick={() => scrollToSection(targetId, prefersReducedMotion)}
        >
            <svg aria-hidden="true" width="26" height="26" viewBox="0 0 28 28" fill="none">
                <path d="M6 8L14 16L22 8" stroke={colors.text.secondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 14L14 22L22 14" stroke={colors.text.secondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
            </svg>
        </button>
    );
}
