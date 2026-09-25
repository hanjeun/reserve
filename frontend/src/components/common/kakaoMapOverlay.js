/**
 * Kakao CustomOverlay에 넣을 가게 링크를 안전한 DOM 노드로 만든다.
 * 사용자 입력을 HTML 또는 JavaScript 문자열에 합치지 않는 것이 이 함수의 보안 계약이다.
 */
export const createStoreOverlayContent = (storeName, mapUrl) => {
    const link = document.createElement('a');
    link.href = mapUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = storeName;
    link.setAttribute('aria-label', `카카오맵에서 ${storeName} 보기`);
    Object.assign(link.style, {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        background: '#fff',
        color: '#111',
        fontSize: '12px',
        fontWeight: '600',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        padding: '6px 12px',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        border: '1px solid rgba(0,0,0,0.08)',
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
        borderTop: '6px solid #fff',
        filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.08))',
    });
    link.appendChild(arrow);
    return link;
};
