import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import PaymentBrandIcon from './PaymentBrandIcon';
afterEach(cleanup);
it('간편결제 SVG도 확정된 비율과 크기로 로컬 원본을 표시해요', () => {
    for (const brand of ['NAVERPAY', 'KAKAOPAY', 'TOSSPAY', 'SAMSUNGPAY', 'APPLEPAY']) {
        const { container, unmount } = render(<PaymentBrandIcon brand={brand} />);
        const image = container.querySelector('img');
        expect(image).not.toBeNull();
        expect(Number(image.getAttribute('width'))).toBeGreaterThan(0);
        expect(Number(image.getAttribute('height'))).toBeGreaterThan(0);
        expect(image.getAttribute('src')).toMatch(/^(data:image\/|\/src\/|\/assets\/)/);
        expect(image).toHaveAttribute('aria-hidden', 'true');
        unmount();
    }
});
