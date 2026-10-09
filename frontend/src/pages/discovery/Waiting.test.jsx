import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import Waiting from './Waiting';
import waitingService from '../../services/waitingService';

vi.mock('../../services/waitingService', () => ({ default: { getStores: vi.fn() } }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: vi.fn() }));
vi.mock('../../components/store/StoreCard', () => ({ default: ({ store }) => <article>{store.name}</article> }));
vi.mock('../../components/store/StoreListRow', () => ({ default: ({ store }) => <article>{store.name}</article> }));
vi.mock('../../components/discovery/RegionSheet', () => ({ default: ({ open, value, onApply }) => open
    ? <section role="dialog" aria-label="지역 선택"><output>{value}</output><button onClick={() => onApply('경기 안산시')}>안산시 적용</button></section> : null }));

function Probe() {
    const location = useLocation(); const navigate = useNavigate();
    return <><output data-testid="route">{location.search}</output>
        <button onClick={() => navigate(location.pathname === '/waiting' ? '/other' : '/waiting')}>탭 이동</button></>;
}
const page = (name, total = 1) => ({ content: [{ id: 1, name }], page: { totalElements: total } });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const show = (url = '/waiting') => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
    <MemoryRouter initialEntries={[url]}><Probe /><Routes><Route path="/waiting" element={<Waiting />} />
        <Route path="/other" element={<div>다른 탭</div>} /></Routes></MemoryRouter></QueryClientProvider>);
const currentParams = () => new URLSearchParams(screen.getByTestId('route').textContent);

beforeEach(() => { vi.resetAllMocks(); sessionStorage.clear(); });

it('reserves the view/count and right-hand controls without interactive filters on the first request', () => {
    waitingService.getStores.mockReturnValue(new Promise(() => {}));
    const { container } = show();
    expect(screen.getByRole('status', { name: '웨이팅 가게를 불러오는 중' })).toHaveAttribute('aria-busy', 'true');
    const toolbar = container.querySelector('.reserve-explore-filters');
    expect(toolbar).toHaveAttribute('aria-hidden', 'true');
    expect(toolbar.querySelector('.reserve-explore-filter-controls')).not.toBeNull();
    expect(toolbar.querySelector('button,input')).toBeNull();
    expect(screen.queryByText('접수 가능한 가게가 없어요.')).toBeNull();
});

it('keeps server count adjacent to the view icon and applies status and sorting before requesting another page', async () => {
    waitingService.getStores.mockResolvedValue(page('웨이팅 가게', 41));
    show('/waiting?view=list&page=2&utm_source=guide');
    await screen.findByText('웨이팅 가게');
    const toolbar = screen.getByLabelText('웨이팅 가게 보기');
    expect(toolbar.querySelector('.reserve-store-view-toggle').nextElementSibling).toHaveTextContent('41개 가게');
    const controls = toolbar.querySelector('.reserve-explore-filter-controls');
    expect(within(controls).getByRole('button', { name: '지역 필터, 전체 지역' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '웨이팅 접수 상태' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '접수 중지' }));
    await waitFor(() => expect(waitingService.getStores).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'PAUSED', page: 0 }), expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByRole('button', { name: '가게 정렬' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '가게 정렬' }));
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '리뷰순' }));
    await waitFor(() => expect(waitingService.getStores).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'PAUSED', sort: 'reviewCount', page: 0 }), expect.any(AbortSignal)));
    expect(currentParams().get('view')).toBe('list'); expect(currentParams().get('utm_source')).toBe('guide');
    expect(currentParams().has('page')).toBe(false);
});

it('restores the selected region on a same-tab revisit and sends it to the waiting query', async () => {
    waitingService.getStores.mockResolvedValue(page('안산 가게'));
    show(); await screen.findByText('안산 가게');
    fireEvent.click(screen.getByRole('button', { name: '지역 필터, 전체 지역' }));
    fireEvent.click(screen.getByRole('button', { name: '안산시 적용' }));
    await waitFor(() => expect(waitingService.getStores).toHaveBeenLastCalledWith(expect.objectContaining({ region: '경기 안산시' }), expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button', { name: '탭 이동' }));
    await screen.findByText('다른 탭');
    fireEvent.click(screen.getByRole('button', { name: '탭 이동' }));
    await screen.findByText('안산 가게');
    expect(screen.getByRole('button', { name: /지역 필터,.*안산/ })).toBeInTheDocument();
    expect(waitingService.getStores).toHaveBeenLastCalledWith(expect.objectContaining({ region: '경기 안산시' }), expect.any(AbortSignal));
});

it('retains the focused search field during a new query without normalizing its page from placeholder totals', async () => {
    const request = deferred();
    waitingService.getStores.mockResolvedValueOnce(page('이전 가게', 1)).mockReturnValue(request.promise);
    show(); await screen.findByText('이전 가게');
    const input = screen.getByPlaceholderText('웨이팅 가게 검색'); input.focus();
    fireEvent.change(input, { target: { value: '새 가게' } });
    await waitFor(() => expect(waitingService.getStores).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: '새 가게', page: 0 }), expect.any(AbortSignal)));
    expect(screen.getByPlaceholderText('웨이팅 가게 검색')).toBe(input); expect(input).toHaveFocus(); expect(input).toBeEnabled();
    await act(async () => request.resolve(page('새 가게', 1)));
    expect(await screen.findByText('새 가게')).toBeInTheDocument();
});
