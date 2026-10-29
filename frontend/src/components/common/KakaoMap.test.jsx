import { fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createStoreOverlayContent } from './kakaoMapOverlay';

describe('KakaoMap store overlay security boundary', () => {
    it('keeps store and address input out of HTML event-handler strings', () => {
        const storeName = `가게 <img src=x onerror=alert('name')>`;
        const restore = vi.fn();

        const content = createStoreOverlayContent(storeName, restore);

        expect(content).toBeInstanceOf(HTMLButtonElement);
        expect(content.textContent).toBe(storeName);
        expect(content).toHaveAttribute('type', 'button');
        expect(content).not.toHaveAttribute('href');
        fireEvent.click(content);
        expect(restore).toHaveBeenCalledTimes(1);
        expect(content.querySelector('[onclick], [onerror], script')).toBeNull();
        expect(content.outerHTML).not.toContain('onclick=');
    });
});
