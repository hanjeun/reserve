import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Bone from './Bone';
import { Bone as LegacyBone } from './Skeletons';

describe('lightweight skeleton primitive compatibility', () => {
    it('preserves the public named export and default block styles', () => {
        expect(LegacyBone).toBe(Bone);
        const { container } = render(<Bone />);
        expect(container.firstChild).toHaveClass('reserve-skeleton-block');
        expect(container.firstChild).toHaveStyle({ width: '100%', height: '14px', flexShrink: '0', borderRadius: '6px' });
    });
    it('keeps explicit dimensions and caller style precedence', () => {
        const { container } = render(<Bone width={72} height={72} borderRadius={14} style={{ height: 56 }} />);
        expect(container.firstChild).toHaveStyle({ width: '72px', height: '56px', borderRadius: '14px' });
        expect(container.querySelector('button,input,a')).toBeNull();
    });
});
