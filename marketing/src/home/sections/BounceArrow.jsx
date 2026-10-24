import { colors } from '../../../../frontend/src/styles/tokens/index.js';

/** 다음 섹션 버튼의 목표 ID를 전달한다. 실제 이동과 헤더 높이 보정은 scroll.js가 처리한다. */

export default function BounceArrow({ targetId, style = {} }) {
    return (
        <button type="button" data-scroll-target={targetId} aria-label="다음 소개 보기"
            className="bounce-arrow"
            style={{ border: 0, background: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'center', width: '100%', boxSizing: 'border-box', padding: '12px 0', ...style }}
        >
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
                <path d="M6 8L14 16L22 8" stroke={colors.text.secondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 14L14 22L22 14" stroke={colors.text.secondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
            </svg>
        </button>
    );
}
