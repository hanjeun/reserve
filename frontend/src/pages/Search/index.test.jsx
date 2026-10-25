import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import SearchPage from './index';
import Header from '../../components/layout/Header';
import { searchCatalog } from '../../constants/searchCatalog';
import useAuthStore from '../../store/useAuthStore';
import { createLoadingPresentation, LoadingPresentationContext } from '../../components/layout/loadingPresentation';
import { addRecentSearch, clearRecentSearches, readRecentSearches, recentSearchOwner } from '../../utils/recentSearches';

const reducedMotionMock = vi.hoisted(() => ({ value: true }));
const searchMock = vi.hoisted(() => ({ data: { groups: [] }, catalog: [] }));
vi.mock('../../hooks/useUnifiedSearch', () => ({ default: ({ keyword, submittedKeyword, confirmed, composing }) => {
    const current = keyword.trim();
    const active = !composing && confirmed && current === submittedKeyword;
    return { keyword: current, valid: current.length > 0 && current.length <= 100, ready: !composing,
        confirmed: active, remoteConfirmed: active, catalog: searchMock.catalog,
        publicQuery: { isFetching: false, isLoading: false, isError: false }, personalQuery: { isFetching: false },
        personalAllowed: false, publicData: active ? searchMock.data : undefined };
} }));

vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => reducedMotionMock.value }));
vi.mock('../../hooks/useGoBack', () => ({ default: () => vi.fn() }));
vi.mock('../../components/layout/HeaderAccountMenu', () => ({ default: () => <button>페이지 메뉴 열기</button> }));

function ResultDestination() {
    const navigate = useNavigate();
    return <button onClick={() => navigate(-1)}>검색 결과로 돌아가기</button>;
}

function RouteProbe() {
    const location = useLocation();
    return <output aria-label="현재 경로">{location.pathname + location.search}</output>;
}

function renderSearch(entries = ['/search'], initialIndex = entries.length - 1, presentation = null) {
    return render(
        <LoadingPresentationContext.Provider value={presentation}>
        <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
            <Routes>
                <Route path="/search" element={<SearchPage />} />
                <Route path="/stores" element={<Header />} />
                <Route path="/store/:id" element={<ResultDestination />} />
                <Route path="/" element={<p>홈</p>} />
            </Routes>
            <RouteProbe />
        </MemoryRouter>
        </LoadingPresentationContext.Provider>,
    );
}

const field = () => screen.getByRole('searchbox', { name: '가게 이름, 지역 또는 서비스 검색' });
const path = () => screen.getByLabelText('현재 경로').textContent;

describe('dedicated search submission and result editing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        reducedMotionMock.value = true;
        clearRecentSearches();
        searchMock.data = { groups: [] }; searchMock.catalog = [];
        useAuthStore.setState({ user: null, isLoggedIn: false, authRestoring: false, isLoggingOut: false, sessionRevision: 31 });
        window.scrollTo = vi.fn();
    });

    it('loads the search term and submits it with Enter', async () => {
        const user = userEvent.setup();
        renderSearch(['/search?keyword=' + encodeURIComponent('공방')]);
        expect(field().value).toBe('공방');
        expect(document.activeElement).toBe(field());
        await user.keyboard('{Enter}');
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('공방'));
        expect(screen.getByLabelText('통합 검색 결과')).toBeInTheDocument();
    });

    it('uses the left search icon to submit the same trimmed keyword', async () => {
        const user = userEvent.setup();
        renderSearch();
        await user.type(field(), '  카페 & 안산  ');
        expect(path()).toBe('/search');
        const submit = screen.getByRole('button', { name: '검색', exact: true });
        expect(submit.getAttribute('type')).toBe('submit');
        expect(submit.querySelector('.anticon-search')).toBeTruthy();
        await user.click(submit);
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페 & 안산'));
    });

    it('keeps empty or whitespace searches on the input screen', async () => {
        const user = userEvent.setup();
        renderSearch();
        await user.click(screen.getByRole('button', { name: '검색', exact: true }));
        expect(path()).toBe('/search');
        expect(document.activeElement).toBe(field());
        await user.type(field(), '   ');
        await user.keyboard('{Enter}');
        expect(path()).toBe('/search');
        expect(document.activeElement).toBe(field());
    });

    it('clears the confirmed URL and restores the original landing with input focus', async () => {
        const user = userEvent.setup();
        renderSearch(['/search?keyword=' + encodeURIComponent('공방')]);
        await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
        expect(field().value).toBe('');
        expect(document.activeElement).toBe(field());
        expect(path()).toBe('/search');
        expect(screen.getByRole('heading', { name: '어떤 서비스를 찾으세요?' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '빠른 검색' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: '최근 검색' })).toBeInTheDocument();
        expect(screen.queryByLabelText('통합 검색 결과')).toBeNull();
    });

    it('returns to the same list filters, view and page when an independent global search is cancelled', async () => {
        const user = userEvent.setup();
        const original = '/stores?keyword=' + encodeURIComponent('공방') + '&domain=OTHER&sort=reviewCount&view=list&page=2';
        renderSearch([original]);
        await user.click(screen.getByRole('link', { name: '통합 검색' }));
        expect(path()).toBe('/search'); expect(field()).toHaveValue('');
        await user.type(field(), '다른 가게');
        await user.click(screen.getByRole('button', { name: '취소' }));
        expect(path()).toBe(original);
        expect(screen.getByRole('button', { name: '목록 검색어 수정: 공방' })).toBeInTheDocument();
    });

    it('opens global search without inheriting a list term and explicitly confirms its own new query', async () => {
        const user = userEvent.setup();
        renderSearch(['/stores?keyword=' + encodeURIComponent('공방') + '&page=2']);
        await user.click(screen.getByRole('link', { name: '통합 검색' }));
        expect(path()).toBe('/search'); expect(field()).toHaveValue('');
        await user.type(field(), '카페');
        await user.click(screen.getByRole('button', { name: '검색', exact: true }));
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페')); expect(field()).toHaveValue('카페');
    });

    it('ignores composition-confirmation Enter and keyCode 229', () => {
        renderSearch(['/search?keyword=' + encodeURIComponent('공방')]);
        expect(fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter', isComposing: true })).toBe(false);
        expect(fireEvent.keyDown(field(), { key: 'Enter', code: 'Enter', keyCode: 229 })).toBe(false);
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('공방'));
    });

    it('preserves Escape navigation for a directly opened search screen', async () => {
        const user = userEvent.setup();
        renderSearch(['/search?keyword=' + encodeURIComponent('공방')]);
        await user.keyboard('{Escape}');
        expect(path()).toBe('/');
    });

    it('animates only content on search entry and slides it down before explicit cancel', () => {
        vi.useFakeTimers();
        try {
            reducedMotionMock.value = false;
            const original = '/stores?keyword=' + encodeURIComponent('공방') + '&view=list&page=2';
            const { container } = renderSearch([original, { pathname: '/search', state: { searchEntry: true } }]);
            expect(container.querySelector('.reserve-search-page--entering')).toBeTruthy();
            expect(document.activeElement).toBe(field());
            fireEvent.click(screen.getByRole('button', { name: '취소' }));
            fireEvent.click(screen.getByRole('button', { name: '취소' }));
            expect(path()).toBe('/search');
            expect(container.querySelector('.reserve-search-page--leaving .reserve-search-content')).toBeTruthy();
            expect(container.querySelector('.reserve-search-header')).toBeTruthy();
            act(() => vi.advanceTimersByTime(220));
            expect(path()).toBe(original);
        } finally {
            vi.useRealTimers();
        }
    });

    it('navigates immediately on cancel when reduced motion is requested', () => {
        renderSearch(['/stores', { pathname: '/search', state: { searchEntry: true } }]);
        fireEvent.click(screen.getByRole('button', { name: '취소' }));
        expect(path()).toBe('/stores');
    });

    it('animates cached content when no route skeleton was shown', () => {
        reducedMotionMock.value = false;
        const { container } = renderSearch();
        expect(container.querySelector('.reserve-search-page')).toHaveClass('reserve-search-page--entering');
    });

    it('does not re-enter after a visible route skeleton and still animates closing', () => {
        vi.useFakeTimers();
        try {
            reducedMotionMock.value = false;
            const presentation = createLoadingPresentation('search-entry');
            presentation.markSkeletonShown();
            const { container } = renderSearch(['/search'], 0, presentation);
            expect(container.querySelector('.reserve-search-page')).not.toHaveClass('reserve-search-page--entering');
            expect(document.activeElement).toBe(field());
            fireEvent.click(screen.getByRole('button', { name: '취소' }));
            expect(container.querySelector('.reserve-search-page')).toHaveClass('reserve-search-page--leaving');
            expect(path()).toBe('/search');
            act(() => vi.advanceTimersByTime(220));
            expect(path()).toBe('/');
        } finally {
            vi.useRealTimers();
        }
    });

    it('does not animate a direct opening when reduced motion is requested', () => {
        const { container } = renderSearch();
        expect(container.querySelector('.reserve-search-page')).not.toHaveClass('reserve-search-page--entering');
    });

    it('uses the same slide-down for Escape as the cancel button', () => {
        vi.useFakeTimers();
        try {
            reducedMotionMock.value = false;
            const { container } = renderSearch(['/stores', { pathname: '/search', state: { searchEntry: true } }]);
            fireEvent.keyDown(field(), { key: 'Escape' });
            expect(path()).toBe('/search');
            expect(container.querySelector('.reserve-search-page--leaving .reserve-search-content')).toBeTruthy();
            act(() => vi.advanceTimersByTime(220));
            expect(path()).toBe('/stores');
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps grouped submissions on the same page without replaying entry or starting leave motion', () => {
        vi.useFakeTimers();
        try {
            reducedMotionMock.value = false;
            const { container } = renderSearch(['/search?keyword=' + encodeURIComponent('카페')]);
            fireEvent.submit(screen.getByRole('search'));
            fireEvent.submit(screen.getByRole('search'));
            expect(container.querySelector('.reserve-search-page')).not.toHaveClass('reserve-search-page--leaving');
            expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페'));
            act(() => vi.advanceTimersByTime(220));
            expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페'));
            expect(readRecentSearches(recentSearchOwner(useAuthStore.getState().user))).toEqual(['카페']);
        } finally {
            vi.useRealTimers();
        }
    });

    it.each([
        ['맛집·카페', '/stores?domain=FOOD'],
        ['운동·웰니스', '/stores?domain=SPORTS'],
    ])('closes search with the same motion before following %s', (name, destination) => {
        vi.useFakeTimers();
        try {
            reducedMotionMock.value = false;
            const { container } = renderSearch();
            fireEvent.click(screen.getByRole('link', { name, exact: true }));
            expect(container.querySelector('.reserve-search-page')).toHaveClass('reserve-search-page--leaving');
            expect(path()).toBe('/search');
            act(() => vi.advanceTimersByTime(220));
            expect(path()).toBe(destination);
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps the current search screen open when a link is opened in a new tab', () => {
        reducedMotionMock.value = false;
        const { container } = renderSearch();
        expect(fireEvent.click(screen.getByRole('link', { name: '맛집·카페' }), { ctrlKey: true })).toBe(true);
        expect(path()).toBe('/search');
        expect(container.querySelector('.reserve-search-page')).not.toHaveClass('reserve-search-page--leaving');
    });

    it('keeps quick searches and service links working', async () => {
        const user = userEvent.setup();
        const { unmount } = renderSearch();
        await user.click(screen.getByRole('button', { name: '카페', exact: true }));
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페'));
        unmount();
        renderSearch();
        await user.click(screen.getByRole('link', { name: '맛집·카페' }));
        expect(path()).toBe('/stores?domain=FOOD');
    });

    it('restores a completed search and runs it through the same search action', async () => {
        const user = userEvent.setup();
        const { unmount } = renderSearch();
        await user.type(field(), '  안산 공방  ');
        await user.keyboard('{Enter}');
        unmount();
        renderSearch();
        expect(screen.queryByRole('link', { name: '가게 전체 보기' })).toBeNull();
        await user.click(screen.getByRole('button', { name: '최근 검색: 안산 공방', exact: true }));
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('안산 공방'));
        expect(readRecentSearches(recentSearchOwner(useAuthStore.getState().user))).toEqual(['안산 공방']);
    });

    it('keeps typed input and cancelled editing out of recent searches', async () => {
        const user = userEvent.setup();
        renderSearch(['/search?keyword=' + encodeURIComponent('입력 중')]);
        expect(screen.queryByRole('heading', { name: '최근 검색' })).toBeNull();
        fireEvent.keyDown(field(), { key: 'Enter', isComposing: true });
        await user.click(screen.getByRole('button', { name: '취소' }));
        expect(readRecentSearches(recentSearchOwner(useAuthStore.getState().user))).toEqual([]);
    });

    it('deletes one recent search without searching and clears the remaining history', async () => {
        const user = userEvent.setup();
        const owner = recentSearchOwner(useAuthStore.getState().user);
        addRecentSearch(owner, '안산 공방');
        addRecentSearch(owner, '서울 스튜디오');
        renderSearch();
        await user.click(screen.getByRole('button', { name: '최근 검색 삭제: 안산 공방', exact: true }));
        expect(path()).toBe('/search');
        expect(screen.queryByRole('button', { name: '최근 검색: 안산 공방', exact: true })).toBeNull();
        expect(screen.getByRole('button', { name: '최근 검색: 서울 스튜디오', exact: true })).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: '전체 삭제', exact: true }));
        expect(screen.getByText('최근 검색한 내용이 없어요.')).toBeInTheDocument();
        expect(readRecentSearches(owner)).toEqual([]);
    });
    it('keeps modified result clicks open and slides down before selecting an existing destination', () => {
        vi.useFakeTimers();
        try {
            reducedMotionMock.value = false;
            searchMock.data = { groups: [{ key: 'stores', items: [{ id: 3, title: '확인 가게', path: '/store/3' }] }] };
            const { container } = renderSearch(['/search?keyword=' + encodeURIComponent('카페')]);
            const link = screen.getByRole('link', { name: '확인 가게' });
            expect(fireEvent.click(link, { ctrlKey: true })).toBe(true);
            expect(container.querySelector('.reserve-search-page')).not.toHaveClass('reserve-search-page--leaving');
            fireEvent.click(link);
            expect(container.querySelector('.reserve-search-page')).toHaveClass('reserve-search-page--leaving');
            expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페'));
            act(() => vi.advanceTimersByTime(220));
            expect(path()).toBe('/store/3');
        } finally { vi.useRealTimers(); }
    });

    it('keeps IME submissions out of recent searches until composition ends', () => {
        renderSearch();
        fireEvent.compositionStart(field());
        fireEvent.change(field(), { target: { value: '카페' } });
        fireEvent.submit(screen.getByRole('search'));
        expect(path()).toBe('/search');
        expect(readRecentSearches(recentSearchOwner(useAuthStore.getState().user))).toEqual([]);
        fireEvent.compositionEnd(field(), { target: { value: '카페' } });
        fireEvent.submit(screen.getByRole('search'));
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페'));
        expect(readRecentSearches(recentSearchOwner(useAuthStore.getState().user))).toEqual(['카페']);
    });

    it('preserves React text escaping and keeps another group usable during a partial failure', () => {
        searchMock.data = { groups: [
            { key: 'stores', items: [], error: { status: 503 } },
            { key: 'benefits', items: [{ id: 3, title: '<img src=x onerror=alert(1)>', path: '/benefits/3' }] },
        ] };
        renderSearch(['/search?keyword=' + encodeURIComponent('카페')]);
        expect(screen.getByRole('alert')).toHaveTextContent('가게 결과');
        const link = screen.getByRole('link', { name: '<img src=x onerror=alert(1)>' });
        expect(link.querySelector('img')).toBeNull();
        expect(field()).toBeEnabled();
    });

    it('restores the submitted URL after a result visit and still cancels to the original list filters', async () => {
        const user = userEvent.setup();
        const original = '/stores?keyword=' + encodeURIComponent('공방') + '&view=list&page=2';
        searchMock.data = { groups: [{ key: 'stores', items: [{ id: 3, title: '복귀 가게', path: '/store/3' }] }] };
        renderSearch([original, { pathname: '/search', state: { searchEntry: true } }]);
        await user.type(field(), '카페');
        await user.keyboard('{Enter}');
        await user.click(screen.getByRole('link', { name: '복귀 가게' }));
        expect(path()).toBe('/store/3');
        await user.click(screen.getByRole('button', { name: '검색 결과로 돌아가기' }));
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페'));
        expect(field()).toHaveValue('카페');
        await user.click(screen.getByRole('button', { name: '취소' }));
        expect(path()).toBe(original);
    });

    it('keeps the blank landing at its original three sections and never mixes it into a nonempty draft', () => {
        const { container } = renderSearch();
        expect(screen.getAllByRole('heading', { level: 2 }).map(node => node.textContent)).toEqual(['어떤 서비스를 찾으세요?', '빠른 검색', '최근 검색']);
        expect(container.querySelectorAll('.reserve-search-domain')).toHaveLength(6);
        expect(screen.queryByLabelText('통합 검색 결과')).toBeNull();
        fireEvent.change(field(), { target: { value: '없는 내용' } });
        expect(screen.queryByRole('heading', { name: '어떤 서비스를 찾으세요?' })).toBeNull();
        expect(screen.queryByRole('heading', { name: '빠른 검색' })).toBeNull(); expect(screen.queryByRole('heading', { name: '최근 검색' })).toBeNull();
        expect(screen.getByRole('button', { name: '없는 내용 검색하기' })).toBeInTheDocument();
        expect(container.querySelector('.reserve-data-state')).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
        expect(screen.queryByLabelText('통합 검색 결과')).toBeNull();
        expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(3);
    });
    it('renders the curated reservation phrase as one existing icon row while typing', () => {
        useAuthStore.setState({ user: { id: 7, role: 'USER', termsAgreed: true }, isLoggedIn: true });
        searchMock.catalog = searchCatalog('내가 예약한', useAuthStore.getState());
        renderSearch(); fireEvent.change(field(), { target: { value: '내가 예약한' } });
        const link = screen.getByRole('link', { name: '내 예약' });
        expect(link.querySelector('.anticon-calendar')).toBeTruthy(); expect(link).toHaveAttribute('href', '/my-reservations');
        expect(screen.queryByRole('heading', { name: '가게' })).toBeNull();
    });
    it('discards stale search-return positioning immediately when the keyword is cleared', () => {
        vi.useFakeTimers();
        try {
            renderSearch([{ pathname: '/search', search: '?keyword=' + encodeURIComponent('카페'), state: {
                searchEntry: true, searchReturn: { keyword: '카페', confirmed: true, path: '/store/3', left: 0, top: 500 },
            } }]);
            window.scrollTo.mockClear();
            fireEvent.click(screen.getByRole('button', { name: '검색어 지우기' }));
            act(() => vi.advanceTimersByTime(32));
            expect(path()).toBe('/search');
            expect(window.scrollTo).toHaveBeenLastCalledWith({ left: 0, top: 0, behavior: 'instant' });
            expect(window.scrollTo).not.toHaveBeenCalledWith({ left: 0, top: 500, behavior: 'instant' });
            expect(screen.queryByLabelText('통합 검색 결과')).toBeNull();
        } finally { vi.useRealTimers(); }
    });

});
