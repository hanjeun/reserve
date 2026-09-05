import { colors } from '../../../styles/tokens';

/**
 * scrollIntoView + scroll-margin-top 조합
 * — 브라우저가 fixed 헤더 오프셋을 자연적으로 처리
 * — Safari 동적 뷰포트(dvh 잔퇄) 문제를 피함
 * — sectionMobile/section 스타일에 scrollMarginTop: heights.header 이미 설정됨
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
