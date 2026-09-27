import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import Header from './Header';

const { goBack } = vi.hoisted(() => ({ goBack: vi.fn() }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => true }));
vi.mock('../../hooks/useGoBack', () => ({ default: () => goBack }));
vi.mock('./HeaderAccountMenu', () => ({ default: () => <button>페이지 메뉴 열기</button> }));

function CurrentRoute() {
    const location = useLocation();
    return <output aria-label="현재 경로">{location.pathname + location.search + (location.state?.searchEntry ? ':searchEntry' : '')}</output>;
}

const renderHeader = (path = '/') => render(
    <MemoryRouter initialEntries={[path]}>
        <Header />
        <CurrentRoute />
    </MemoryRouter>,
);

describe('shared wordmark and icon-only header', () => {
    beforeEach(() => { vi.clearAllMocks(); });

    it('uses one full wordmark and retains the account menu', async () => {
        renderHeader('/stores');
        const logo = screen.getByRole('link', { name: 'RESERVE 홈' });
        expect(logo.textContent).toBe('RESERVE');
        expect(logo.querySelector('img')).toBeNull();
        expect(screen.getByRole('link', { name: '가게·지역·서비스 검색' }).textContent).toBe('');
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(await screen.findByRole('button', { name: '페이지 메뉴 열기' })).toBeTruthy();
    });

    it('opens dedicated search with the current result keyword and return state', () => {
        renderHeader('/stores?keyword=' + encodeURIComponent('카페 안산') + '&page=2');
        fireEvent.click(screen.getByRole('link', { name: '가게·지역·서비스 검색' }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/search?keyword=' + encodeURIComponent('카페 안산') + ':searchEntry');
    });

    it('keeps the full wordmark and the existing back action on deeper screens', () => {
        renderHeader('/store/12');
        expect(screen.getByRole('link', { name: 'RESERVE 홈' }).textContent).toBe('RESERVE');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
        expect(goBack).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/');
    });

    it('scrolls home without losing the existing reduced-motion behavior', () => {
        const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        renderHeader();
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
        scroll.mockRestore();
    });
});
