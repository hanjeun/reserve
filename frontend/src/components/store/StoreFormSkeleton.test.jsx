import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StoreFormSkeleton from './StoreFormSkeleton';

describe('StoreFormSkeleton', () => {
    it('reserves the full form structure instead of ending after a few inputs', () => {
        const { container } = render(<StoreFormSkeleton />);

        expect(container.querySelector('[data-skeleton-section="basic"]')).not.toBeNull();
        expect(container.querySelector('[data-skeleton-section="settings"]')).not.toBeNull();
        expect(container.querySelector('[data-skeleton-section="images"]')).not.toBeNull();
        expect(container.querySelector('[data-skeleton-section="actions"]')).not.toBeNull();
        expect(container.querySelectorAll('.reserve-store-form-skeleton-toggle')).toHaveLength(4);
        expect(container.querySelectorAll('.reserve-store-form-skeleton-uploads > .reserve-skeleton-block')).toHaveLength(3);
    });
});
