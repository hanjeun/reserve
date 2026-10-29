import { colors } from '../../styles/tokens';

/**
 * 가게 이름은 HTML로 해석하지 않고 지도 복원 버튼에 표시한다.
 */
export const createStoreOverlayContent = (storeName, onRestore) => {
    const link = document.createElement('button');
    link.className = 'reserve-kakao-map-callout';
    link.type = 'button';
    link.addEventListener('click', event => { event.stopPropagation(); onRestore(); });
    link.textContent = storeName;
    link.setAttribute('aria-label', `${storeName} 위치로 돌아가기`);
    Object.assign(link.style, {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        background: colors.background.paper,
        color: colors.text.primary,
        fontSize: '12px',
        fontWeight: '600',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: '6px 12px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        border: `1px solid ${colors.border.default}`,
        textDecoration: 'none',
    });

    const arrow = document.createElement('span');
    arrow.setAttribute('aria-hidden', 'true');
    Object.assign(arrow.style, {
        position: 'absolute',
        bottom: '-6px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '0',
        height: '0',
        borderLeft: '5px solid transparent',
        borderRight: '5px solid transparent',
        borderTop: `6px solid ${colors.background.paper}`,
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.08))',
    });
    link.appendChild(arrow);
    return link;
};
