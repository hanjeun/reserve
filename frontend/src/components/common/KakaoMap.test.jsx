import { describe, expect, it } from 'vitest';
import { createStoreOverlayContent } from './kakaoMapOverlay';

describe('KakaoMap store overlay security boundary', () => {
    it('keeps store and address input out of HTML event-handler strings', () => {
        const storeName = `가게 <img src=x onerror=alert('name')>`;
        const mapUrl = `https://map.kakao.com/link/search/x'-alert(1)-'`;

        const content = createStoreOverlayContent(storeName, mapUrl);

        expect(content).toBeInstanceOf(HTMLAnchorElement);
        expect(content.textContent).toBe(storeName);
        expect(content.getAttribute('href')).toBe(mapUrl);
        expect(content.getAttribute('target')).toBe('_blank');
        expect(content.getAttribute('rel')).toBe('noopener noreferrer');
        expect(content.querySelector('[onclick], [onerror], script')).toBeNull();
        expect(content.outerHTML).not.toContain('onclick=');
    });
});
