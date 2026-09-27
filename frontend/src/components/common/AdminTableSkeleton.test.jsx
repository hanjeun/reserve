import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdminTableSkeleton from './AdminTableSkeleton';

const actionCell = (container) => {
    const table = container.firstChild.firstChild;
    const firstDataRow = table.children[1];
    return firstDataRow.lastChild;
};

describe('AdminTableSkeleton action column', () => {
    it('uses a text bone by default because the last column is not always an action column', () => {
        const { container } = render(
            <AdminTableSkeleton rows={1} cols={[120, 110]} headers={['이름', '마지막 감지']} />,
        );

        const bones = actionCell(container).querySelectorAll('.reserve-skeleton-block');
        expect(bones).toHaveLength(1);
        expect(bones[0]).toHaveStyle({ width: '70%' });
    });

    it('renders only the number of action buttons declared by the table', () => {
        const { container } = render(
            <AdminTableSkeleton rows={1} cols={[120, 110]} headers={['이름', '처리']} actionBtns={1} />,
        );

        const bones = actionCell(container).querySelectorAll('.reserve-skeleton-block');
        expect(bones).toHaveLength(1);
        expect(bones[0]).toHaveStyle({ width: '52px' });
    });

    it('keeps two processing controls reachable through the same horizontal scroll as the real table', () => {
        const { container } = render(
            <AdminTableSkeleton rows={1} cols={[320, 230]} headers={['주문번호', '처리']} actionBtns={2} />,
        );

        const scrollFrame = container.firstChild.firstChild;
        expect(scrollFrame).toHaveStyle({ overflowX: 'auto', overflowY: 'hidden' });
        expect(scrollFrame.firstChild).toHaveStyle({ minWidth: 'max-content' });
        const bones = actionCell(container).querySelectorAll('.reserve-skeleton-block');
        expect(bones).toHaveLength(2);
        expect([...bones].map((bone) => bone.style.width)).toEqual(['52px', '52px']);
    });
});
