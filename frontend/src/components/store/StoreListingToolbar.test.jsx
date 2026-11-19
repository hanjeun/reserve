import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import StoreListingToolbar from './StoreListingToolbar';

const props = {
    view: 'cards',
    onViewChange: vi.fn(),
    regionOpen: false,
    onRegionOpen: vi.fn(),
    domain: 'ALL',
    onDomainChange: vi.fn(),
    sort: 'rating',
    onSortChange: vi.fn(),
    sortOptions: [{ value: 'rating', label: '별점순' }],
};

describe('StoreListingToolbar', () => {
    it('uses an icon-only region trigger and marks an applied region as active', () => {
        const { rerender } = render(<StoreListingToolbar {...props} />);
        const allRegion = screen.getByRole('button', { name: '지역 필터, 전체 지역' });
        expect(allRegion).toHaveTextContent('');
        expect(allRegion).not.toHaveClass('is-active');
        expect(screen.getByRole('button', { name: '가게 정렬' }).querySelector('.anticon-sort-ascending')).toBeNull();

        rerender(<StoreListingToolbar {...props} region="서울" />);
        expect(screen.getByRole('button', { name: /지역 필터, 서울/ })).toHaveClass('is-active');
    });

    it('disables every query-changing control while the list is loading', () => {
        render(<StoreListingToolbar {...props} disabled />);
        expect(screen.getByRole('button', { name: '목록형 보기로 전환' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '지역 필터, 전체 지역' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '서비스 분야' })).toBeDisabled();
        expect(screen.getByRole('button', { name: '가게 정렬' })).toBeDisabled();
    });

    it('키보드로 정렬을 선택하면 실행 버튼으로 포커스가 돌아온다', async () => {
        const onSortChange = vi.fn();
        render(<StoreListingToolbar {...props} onSortChange={onSortChange}
            sortOptions={[...props.sortOptions, { value: 'reviewCount', label: '리뷰순' }]} />);
        const trigger = screen.getByRole('button', { name: '가게 정렬' });
        fireEvent.click(trigger);
        const option = await screen.findByRole('menuitemradio', { name: '리뷰순' });
        option.focus();
        expect(option).toHaveFocus();
        fireEvent.keyDown(option, { key: 'Enter', keyCode: 13, which: 13 });
        expect(onSortChange).toHaveBeenCalledWith('reviewCount');
        expect(trigger).toHaveFocus();
    });

    it('맛집·카페와 전체 분야 사이에서 메뉴의 선택 라벨을 양방향으로 전환한다', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
        const animate = vi.fn(() => ({ cancel: vi.fn(), playState: 'running', pending: false }));
        Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
        function DomainToolbar() {
            const [domain, setDomain] = useState('FOOD');
            return <StoreListingToolbar {...props} domain={domain} onDomainChange={setDomain} />;
        }
        try {
            render(<DomainToolbar />);
            const trigger = screen.getByRole('button', { name: '서비스 분야' });
            const label = trigger.querySelector('.reserve-rolling-field-value');
            expect(label.firstElementChild).toHaveTextContent('맛집 · 카페');
            expect(animate).not.toHaveBeenCalled();

            fireEvent.click(trigger);
            fireEvent.click(await screen.findByRole('menuitemradio', { name: '전체 분야' }));
            expect(label.firstElementChild).toHaveTextContent('전체 분야');
            expect(trigger).toHaveFocus();
            expect(animate).toHaveBeenCalledTimes(2);
            expect(animate.mock.calls[0][0][0].transform).toBe('translateY(70%) rotateX(-25deg)');
            animate.mock.results[0].value.onfinish();

            fireEvent.click(trigger);
            fireEvent.click(await screen.findByRole('menuitemradio', { name: '맛집 · 카페' }));
            expect(label.firstElementChild).toHaveTextContent('맛집 · 카페');
            expect(animate).toHaveBeenCalledTimes(4);
            expect(animate.mock.calls[2][0][0].transform).toBe('translateY(-70%) rotateX(25deg)');
        } finally {
            if (descriptor) Object.defineProperty(HTMLElement.prototype, 'animate', descriptor);
            else delete HTMLElement.prototype.animate;
        }
    });
});
