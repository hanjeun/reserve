import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import MyStores from './MyStores';

const ownedStores = [
    { id: 1, name: '안산 한식', address: '경기도 안산시 단원구', serviceDomain: 'FOOD', category: '한식', mainImageUrl: '', rating: 4.2, reviewCount: 8 },
    { id: 2, name: '서울 뷰티', address: '서울특별시 종로구', serviceDomain: 'BEAUTY_CLINIC', category: '뷰티', mainImageUrl: '', rating: 4.9, reviewCount: 1 },
];

vi.mock('../../hooks', () => ({ useMyStores: () => ({ stores: ownedStores, loading: false, error: null, refetch: vi.fn(), deleteStore: vi.fn() }) }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../components/common/FilterMenu', () => ({
    default: ({ value, onChange, 'aria-label': label, options }) => <select aria-label={label} value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>,
}));
vi.mock('../../components/common', () => {
    const Card = ({ children, actions }) => <div data-testid="manage-card">{children}<div>{actions}</div></div>;
    Card.Cover = ({ alt }) => <img alt={alt} />;
    Card.Add = ({ children }) => <button type="button">{children}</button>;
    return {
        PageContainer: ({ children }) => <main>{children}</main>,
        Button: ({ children, onClick }) => <button type="button" onClick={onClick}>{children}</button>,
        Card,
        StoreCardSkeleton: () => null,
        Badge: ({ children }) => <span>{children}</span>,
        ModalLoading: () => null,
        DataState: ({ state: dataState = 'empty', title, subject, onRetry, action }) => (
            <section role={dataState === 'error' ? 'alert' : undefined}>
                <span>{title ?? `${subject ?? '목록'}을 불러오지 못했습니다.`}</span>
                {action ?? (onRetry && <button type="button" onClick={onRetry}>다시 불러오기</button>)}
            </section>
        ),
    };
});
vi.mock('../../components/discovery/RegionSheet', () => ({ default: ({ open, availableGroups, onApply }) => open ? <div role="dialog" aria-label="지역 선택">
    <output data-testid="owned-region-groups">{JSON.stringify(availableGroups)}</output>
    <button type="button" onClick={() => onApply('경기')}>경기 적용</button>
</div> : null }));
vi.mock('antd', () => ({
    Alert: () => null,
    Typography: { Title: ({ children }) => <h2>{children}</h2>, Paragraph: ({ children }) => <p>{children}</p>, Text: ({ children }) => <span>{children}</span> },
    Empty: ({ description, children }) => <div>{description}{children}</div>,
    Modal: () => null,
    Flex: ({ children }) => <div>{children}</div>,
}));

function RouteProbe() {
    const location = useLocation();
    return <output data-testid="route">{location.search}</output>;
}

const renderMyStores = (url = '/my-stores') => render(<MemoryRouter initialEntries={[url]}><MyStores /><RouteProbe /></MemoryRouter>);
const routeParams = () => new URLSearchParams(screen.getByTestId('route').textContent);

describe('my stores shared toolbar', () => {
    it('switches cards and rows while preserving URL state and management actions', async () => {
        const user = userEvent.setup();
        renderMyStores('/my-stores?utm_source=yes');
        expect(screen.getAllByTestId('manage-card')).toHaveLength(2);
        expect(routeParams().get('view')).toBe('cards');
        await user.click(screen.getByRole('button', { name: '목록형 보기로 전환' }));
        expect(screen.queryAllByTestId('manage-card')).toHaveLength(0);
        expect(screen.getAllByRole('article')).toHaveLength(2);
        expect(screen.getByRole('button', { name: '안산 한식 수정' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '안산 한식 삭제' })).toBeInTheDocument();
        expect(Object.fromEntries(routeParams())).toEqual({ utm_source: 'yes', view: 'list' });
    });

    it('filters owned stores locally and keeps the view without offering a region control', async () => {
        const user = userEvent.setup();
        renderMyStores('/my-stores?view=list&region=부산&utm_source=yes');
        expect(screen.getAllByRole('article')).toHaveLength(2);
        await user.selectOptions(screen.getByLabelText('서비스 분야'), 'FOOD');
        expect(screen.getAllByRole('article')).toHaveLength(1);
        expect(screen.getByText('안산 한식')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /전체 지역/ })).not.toBeInTheDocument();
        expect(screen.queryByRole('dialog', { name: '지역 선택' })).not.toBeInTheDocument();
        expect(routeParams().get('domain')).toBe('FOOD');
        expect(routeParams().get('view')).toBe('list');
        expect(routeParams().get('utm_source')).toBe('yes');
    });

    it('offers a filter reset when a management filter has no matches', async () => {
        const user = userEvent.setup();
        renderMyStores('/my-stores?view=list&domain=SPORTS&region=부산&utm_source=yes');
        expect(screen.getByText('조건에 맞는 내 가게가 없어요.')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '필터 초기화' }));
        expect(screen.getAllByRole('article')).toHaveLength(2);
        expect(routeParams().get('domain')).toBeNull();
        expect(routeParams().get('region')).toBeNull();
        expect(routeParams().get('view')).toBe('list');
        expect(routeParams().get('utm_source')).toBe('yes');
    });
});
