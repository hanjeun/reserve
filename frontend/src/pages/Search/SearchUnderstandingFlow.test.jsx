import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import SearchPage from './index';
import searchService from '../../services/searchService';
import useAuthStore from '../../store/useAuthStore';

vi.mock('../../services/searchService', () => ({ default: { public: vi.fn(), personal: vi.fn() } }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => true }));
const clients = new Set();
function Route() { const location = useLocation(); return <output aria-label="검색 주소">{location.search}</output>; }
function show() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); clients.add(client);
    render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/search']}><SearchPage /><Route /></MemoryRouter></QueryClientProvider>);
}
const response = (keyword, keys) => ({ keyword, groups: keys.map(key => ({ key, items: [], hasMore: false, error: null })) });
beforeEach(() => {
    vi.clearAllMocks(); vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-25T15:01:00Z'));
    useAuthStore.setState({ user: { id: 7, role: 'USER', termsAgreed: true }, isLoggedIn: true, authRestoring: false, isLoggingOut: false, sessionRevision: 50 });
    searchService.public.mockImplementation(keyword => Promise.resolve(response(keyword, ['stores', 'benefits', 'feed'])));
    searchService.personal.mockImplementation(keyword => Promise.resolve(response(keyword, ['reservations', 'waiting', 'messages'])));
});
afterEach(() => { clients.forEach(client => client.clear()); clients.clear(); vi.restoreAllMocks(); });
it('실제 화면과 hook에서 날짜 선택 전에는 요청하지 않고 선택 후 본인 검색만 한 번 실행한다', async () => {
    const user = userEvent.setup(); show();
    await user.type(screen.getByRole('searchbox'), '내일 예약'); await user.keyboard('{Enter}');
    await act(async () => { await Promise.resolve(); });
    expect(searchService.public).not.toHaveBeenCalled(); expect(searchService.personal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '내일 내 예약' }));
    await waitFor(() => expect(searchService.personal).toHaveBeenCalledOnce());
    expect(searchService.personal.mock.calls[0][3]).toMatchObject({ scope: 'reservations', term: '', date: '2026-10-27' });
    expect(screen.getByLabelText('검색 주소')).toHaveTextContent('choice=reservations');
    expect(searchService.public).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
    expect(screen.getByRole('heading', { name: '어떤 서비스를 찾으세요?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '빠른 검색' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '최근 검색' })).toBeInTheDocument();
    expect(screen.getByLabelText('검색 주소')).toHaveTextContent('');
});
it('교정 선택을 명시적으로 확정하고 원문 입력 중에는 서버를 조회하지 않는다', async () => {
    const user = userEvent.setup(); show();
    await user.type(screen.getByRole('searchbox'), '스터디오');
    expect(searchService.public).not.toHaveBeenCalled(); expect(searchService.personal).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '스튜디오 검색하기' }));
    await waitFor(() => expect(searchService.public).toHaveBeenCalledOnce());
    expect(searchService.personal).toHaveBeenCalledOnce();
    expect(searchService.public.mock.calls[0][0]).toBe('스튜디오');
    expect(screen.getByRole('searchbox')).toHaveValue('스튜디오');
});
