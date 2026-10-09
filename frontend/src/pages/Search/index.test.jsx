import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import SearchPage from './index';
import Header from '../../components/layout/Header';
import useAuthStore from '../../store/useAuthStore';
import { addRecentSearch, clearRecentSearches, readRecentSearches, recentSearchOwner } from '../../utils/recentSearches';

const reducedMotionMock = vi.hoisted(() => ({ value: true }));

vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => reducedMotionMock.value }));
vi.mock('../../hooks/useGoBack', () => ({ default: () => vi.fn() }));
vi.mock('../../components/layout/HeaderAccountMenu', () => ({ default: () => <button>페이지 메뉴 열기</button> }));

function RouteProbe() {
    const location = useLocation();
    return <output aria-label="현재 경로">{location.pathname + location.search}</output>;
}

function renderSearch(entries = ['/search'], initialIndex = entries.length - 1) {
    return render(
        <MemoryRouter initialEntries={entries} initialIndex={initialIndex}>
            <Routes>
                <Route path="/search" element={<SearchPage />} />
                <Route path="/stores" element={<Header />} />
                <Route path="/" element={<p>홈</p>} />
            </Routes>
            <RouteProbe />
        </MemoryRouter>,
    );
}

const field = () => screen.getByRole('searchbox', { name: '가게 이름, 지역 또는 서비스 검색' });
const path = () => screen.getByLabelText('현재 경로').textContent;

describe('dedicated search submission and result editing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        reducedMotionMock.value = true;
        clearRecentSearches();
    });

    it('loads the search term and submits it with Enter', async () => {
        const user = userEvent.setup();
        renderSearch(['/search?keyword=' + encodeURIComponent('공방')]);
        expect(field().value).toBe('공방');
        expect(document.activeElement).toBe(field());
        await user.keyboard('{Enter}');
        expect(path()).toBe('/stores?keyword=' + encodeURIComponent('공방'));
        expect(screen.getByRole('link', { name: '검색어 수정: 공방' }).textContent).toBe('공방');
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
        expect(path()).toBe('/stores?keyword=' + encodeURIComponent('카페 & 안산'));
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

    it('clears only the input and restores input focus', async () => {
        const user = userEvent.setup();
        renderSearch(['/search?keyword=' + encodeURIComponent('공방')]);
        await user.click(screen.getByRole('button', { name: '검색어 지우기' }));
        expect(field().value).toBe('');
        expect(document.activeElement).toBe(field());
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('공방'));
    });

    it('returns to the same result filters, view and page when editing is cancelled', async () => {
        const user = userEvent.setup();
        const original = '/stores?keyword=' + encodeURIComponent('공방') + '&domain=OTHER&sort=reviewCount&view=list&page=2';
        renderSearch([original]);
        await user.click(screen.getByRole('link', { name: '검색어 수정: 공방' }));
        expect(field().value).toBe('공방');
        await user.clear(field());
        await user.type(field(), '다른 가게');
        await user.click(screen.getByRole('button', { name: '취소' }));
        expect(path()).toBe(original);
        expect(screen.getByRole('link', { name: '검색어 수정: 공방' })).toBeTruthy();
    });

    it('lets the result search field open the existing search screen and run a new search', async () => {
        const user = userEvent.setup();
        renderSearch(['/stores?keyword=' + encodeURIComponent('공방') + '&page=2']);
        await user.click(screen.getByRole('link', { name: '검색어 수정: 공방' }));
        expect(path()).toBe('/search?keyword=' + encodeURIComponent('공방'));
        expect(field().value).toBe('공방');
        await user.clear(field());
        await user.type(field(), '카페');
        await user.click(screen.getByRole('button', { name: '검색', exact: true }));
        expect(path()).toBe('/stores?keyword=' + encodeURIComponent('카페'));
        expect(screen.getByRole('link', { name: '검색어 수정: 카페' })).toBeTruthy();
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

    it('uses its own entrance even for a direct opening after a route skeleton', () => {
        reducedMotionMock.value = false;
        const { container } = renderSearch();
        expect(container.querySelector('.reserve-search-page')).toHaveClass('reserve-search-page--entering');
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

    it('uses the same slide-down for submitting a search and ignores repeated submissions', () => {
        vi.useFakeTimers();
        try {
            reducedMotionMock.value = false;
            const { container } = renderSearch(['/search?keyword=' + encodeURIComponent('카페')]);
            fireEvent.submit(screen.getByRole('search'));
            fireEvent.submit(screen.getByRole('search'));
            expect(container.querySelector('.reserve-search-page')).toHaveClass('reserve-search-page--leaving');
            expect(path()).toBe('/search?keyword=' + encodeURIComponent('카페'));
            act(() => vi.advanceTimersByTime(220));
            expect(path()).toBe('/stores?keyword=' + encodeURIComponent('카페'));
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
        expect(path()).toBe('/stores?keyword=' + encodeURIComponent('카페'));
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
        expect(path()).toBe('/stores?keyword=' + encodeURIComponent('안산 공방'));
        expect(readRecentSearches(recentSearchOwner(useAuthStore.getState().user))).toEqual(['안산 공방']);
    });

    it('keeps typed input and cancelled editing out of recent searches', async () => {
        const user = userEvent.setup();
        renderSearch(['/search?keyword=' + encodeURIComponent('입력 중')]);
        expect(screen.getByText('최근 검색한 내용이 없어요.')).toBeInTheDocument();
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
});
