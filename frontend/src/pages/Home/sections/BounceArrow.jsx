import { colors } from '../../../styles/tokens';

const HEADER_HEIGHT = 64;

const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - HEADER_HEIGHT;
    window.scrollTo({ top, behavior: 'smooth' });
};

export default function BounceArrow({ targetId, style = {} }) {
    return (
        <div
            className="bounce-arrow"
            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'center', width: '100%', boxSizing: 'border-box', padding: '20px 0 24px', ...style }}
            onClick={() => scrollToSection(targetId)}
        >
            <svg width="26" height="26" viewBox="0 0 28 28" fill="none">
                <path d="M6 8L14 16L22 8" stroke={colors.text.secondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M6 14L14 22L22 14" stroke={colors.text.secondary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35" />
            </svg>
        </div>
    );
}
