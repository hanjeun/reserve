import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import Header from './Header';

const { goBack, authState, reducedMotionState } = vi.hoisted(() => ({
    goBack: vi.fn(),
    authState: { isLoggedIn: false },
    reducedMotionState: { value: true },
}));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => reducedMotionState.value }));
vi.mock('../../hooks/useGoBack', () => ({ default: () => goBack }));
vi.mock('../../store/useAuthStore', () => ({ default: () => authState }));
vi.mock('./HeaderAccountMenu', () => ({ default: () => <button>내 계정 메뉴 열기</button> }));

function CurrentRoute() {
    const location = useLocation();
    return <output aria-label="현재 경로">{location.pathname + location.search + (location.state?.searchEntry ? ':searchEntry' : '')}</output>;
}

function RouteCommitProbe() {
    const navigate = useNavigate();
    return <>
        <button onClick={() => navigate('/')}>이동 완료</button>
        <button onClick={() => navigate('/terms')}>다른 화면 이동</button>
        <button onClick={() => navigate(-1)}>히스토리 뒤로</button>
        <button onClick={() => navigate(1)}>히스토리 앞으로</button>
    </>;
}

const renderHeader = (path = '/') => render(
    <MemoryRouter initialEntries={[path]}>
        <Header />
        <CurrentRoute />
        <RouteCommitProbe />
    </MemoryRouter>,
);

describe('shared wordmark and result search header', () => {
    beforeEach(() => { vi.clearAllMocks(); authState.isLoggedIn = false; reducedMotionState.value = true; });

    it('uses one full wordmark and restores Login / Start for guests', () => {
        renderHeader('/stores');
        const logo = screen.getByRole('link', { name: 'RESERVE 홈' });
        expect(logo.textContent).toBe('RESERVE');
        expect(logo.querySelector('img')).toBeNull();
        expect(screen.getByRole('link', { name: '가게·지역·서비스 검색' }).textContent).toBe('');
        expect(screen.queryByRole('textbox')).toBeNull();
        expect(screen.getByRole('button', { name: '로그인' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '시작하기' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '내 계정 메뉴 열기' })).toBeNull();
        expect(screen.queryByText('관심 가게')).toBeNull();
        expect(screen.queryByText('내 예약 확인')).toBeNull();
    });

    it('keeps guest account actions usable on deeper routes', () => {
        const { unmount } = renderHeader('/store/12');
        fireEvent.click(screen.getByRole('button', { name: '로그인' }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/login');
        unmount();
        renderHeader('/store/12');
        fireEvent.click(screen.getByRole('button', { name: '시작하기' }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/signup');
    });

    it('retains the existing account menu for signed-in users', async () => {
        authState.isLoggedIn = true;
        renderHeader('/stores');
        expect(await screen.findByRole('button', { name: '내 계정 메뉴 열기' })).toBeTruthy();
        expect(screen.queryByRole('button', { name: '로그인' })).toBeNull();
        expect(screen.queryByRole('button', { name: '시작하기' })).toBeNull();
    });

    it('opens dedicated search with the current result keyword and return state', () => {
        renderHeader('/stores?keyword=' + encodeURIComponent('카페 안산') + '&page=2');
        const query = screen.getByRole('link', { name: '검색어 수정: 카페 안산' });
        expect(query.textContent).toBe('카페 안산');
        expect(query.getAttribute('title')).toBe('카페 안산');
        expect(screen.queryByRole('link', { name: '가게·지역·서비스 검색' })).toBeNull();
        expect(screen.queryByRole('textbox')).toBeNull();
        // 모바일은 CSS 로 로고를 숨기고 PC 는 워드마크를 유지한다 — 한 글자 R 로고는 더 이상 없다.
        expect(screen.getByRole('banner')).toHaveClass('reserve-header-has-query');
        expect(screen.getByRole('link', { name: 'RESERVE 홈' }).querySelector('.reserve-header-logo-compact')).toBeNull();
        fireEvent.click(query);
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/search?keyword=' + encodeURIComponent('카페 안산') + ':searchEntry');
    });

    it('marks only a nonempty store keyword result so mobile hides the brand there', () => {
        const { unmount } = renderHeader('/stores?keyword=%20%20&domain=FOOD');
        expect(screen.getByRole('banner')).not.toHaveClass('reserve-header-has-query');
        expect(screen.getByRole('link', { name: '가게·지역·서비스 검색' })).toBeTruthy();
        unmount();
        renderHeader('/my-page?keyword=' + encodeURIComponent('공방'));
        expect(screen.getByRole('banner')).not.toHaveClass('reserve-header-has-query');
        expect(screen.queryByRole('link', { name: '검색어 수정: 공방' })).toBeNull();
    });

    it('renders search terms as text and safely encodes the search link', () => {
        const term = '<img src=x onerror=alert(1)> & 공방';
        renderHeader('/stores/?keyword=' + encodeURIComponent(term));
        const query = screen.getByRole('link', { name: '검색어 수정: ' + term });
        expect(query.querySelector('.reserve-header-query-text').textContent).toBe(term);
        expect(query.querySelector('img')).toBeNull();
        expect(query.getAttribute('href')).toBe('/search?keyword=' + encodeURIComponent(term));
    });

    it('keeps the full wordmark and the existing back action on deeper screens', () => {
        renderHeader('/store/12');
        expect(screen.getByRole('link', { name: 'RESERVE 홈' }).textContent).toBe('RESERVE');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
        expect(goBack).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/');
    });

    it('lets the messages page play its close animation before navigating back', () => {
        const onCloseRequest = vi.fn((event) => event.preventDefault());
        window.addEventListener('reserve:messenger-route-close', onCloseRequest);
        const { unmount } = renderHeader('/messages');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
        expect(onCloseRequest).toHaveBeenCalledTimes(1);
        expect(goBack).not.toHaveBeenCalled();
        unmount();
        window.removeEventListener('reserve:messenger-route-close', onCloseRequest);

        renderHeader('/messages');
        fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
        expect(goBack).toHaveBeenCalledTimes(1);
    });

    it('lets the messages page close with its animation before the logo goes home', () => {
        const onCloseRequest = vi.fn((event) => event.preventDefault());
        window.addEventListener('reserve:messenger-route-close', onCloseRequest);
        const { unmount } = renderHeader('/messages');
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(onCloseRequest).toHaveBeenCalledTimes(1);
        expect(onCloseRequest.mock.calls[0][0].detail).toEqual({ to: '/' });
        expect(screen.getByLabelText('현재 경로').textContent).toBe('/messages');
        unmount();
        window.removeEventListener('reserve:messenger-route-close', onCloseRequest);
    });

    it('leaves a single bottom divider below discovery tabs while deeper routes keep their header divider', () => {
        const { unmount } = renderHeader('/');
        expect(screen.getByRole('banner').getAttribute('style')).toMatch(/box-shadow:\s*none;/);
        expect(screen.getByRole('banner').getAttribute('style')).not.toMatch(/border-bottom/);
        unmount();
        renderHeader('/store/12');
        expect(screen.getByRole('banner').getAttribute('style')).toMatch(/box-shadow:\s*inset 0(?:px)? -1px 0(?:px)?/);
        expect(screen.getByRole('banner').getAttribute('style')).not.toMatch(/border-bottom/);
    });

    it('scrolls home without losing the existing reduced-motion behavior', () => {
        const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        renderHeader();
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'auto' });
        scroll.mockRestore();
    });

    it('plays a brief motion before going back but moves home at once with a still logo', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            const { unmount } = renderHeader('/store/12');
            const back = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            fireEvent.click(back);
            expect(back).toHaveClass('reserve-header-back--leaving');
            expect(goBack).not.toHaveBeenCalled();
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledOnce();

            unmount();
            renderHeader('/store/12');
            const logo = screen.getByRole('link', { name: 'RESERVE 홈' });
            fireEvent.click(logo);
            // 로고는 움직이지 않는다 — 눌림 모션도, 그걸 기다리는 지연도 없이 바로 홈으로 간다.
            expect(logo).not.toHaveClass('reserve-header-logo--home-motion');
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/');
        } finally {
            vi.useRealTimers();
        }
    });

    it('collapses the back button with the same motion when the logo leaves a deeper screen', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/store/12');
            fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
            // 로고는 기다리지 않고 바로 홈으로 간다.
            expect(screen.getByLabelText('현재 경로').textContent).toBe('/');
            // 버튼은 그 자리에서 사라지지 않고 ← 를 눌렀을 때와 같은 접힘 모션을 재생한다.
            const leaving = document.querySelector('.reserve-header-back');
            expect(leaving).toHaveClass('reserve-header-back--leaving');
            expect(leaving).toBeDisabled();
            expect(leaving).toHaveAttribute('aria-hidden', 'true');
            act(() => { vi.advanceTimersByTime(180); });
            expect(document.querySelector('.reserve-header-back')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('keeps one collapse and one back action until the asynchronous history move commits', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/store/12');
            const back = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            fireEvent.click(back);
            fireEvent.click(back);
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledOnce();
            // navigate(-1)는 타이머가 끝나도 아직 현재 화면에 머물 수 있다.
            expect(back).toHaveClass('reserve-header-back--leaving');
            expect(back).toBeDisabled();
            fireEvent.click(back);
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledOnce();
            fireEvent.click(screen.getByRole('button', { name: '이동 완료' }));
            expect(document.querySelector('.reserve-header-back')).toBe(back);
            expect(back).toHaveClass('reserve-header-back--leaving');
            act(() => { vi.advanceTimersByTime(180); });
            expect(document.querySelector('.reserve-header-back')).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    it('cancels an old delayed back when another navigation commits first', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/store/12');
            fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
            fireEvent.click(screen.getByRole('button', { name: '다른 화면 이동' }));
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).not.toHaveBeenCalled();
            const back = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            expect(back).not.toBeDisabled();
            fireEvent.click(back);
            act(() => { vi.advanceTimersByTime(180); });
            expect(goBack).toHaveBeenCalledOnce();
        } finally {
            vi.useRealTimers();
        }
    });

    it('unlocks the back button when browser forward restores the same history entry key', () => {
        vi.useFakeTimers();
        reducedMotionState.value = false;
        try {
            renderHeader('/store/12');
            fireEvent.click(screen.getByRole('button', { name: '다른 화면 이동' }));
            fireEvent.click(screen.getByRole('button', { name: '이전 화면으로 돌아가기' }));
            act(() => { vi.advanceTimersByTime(180); });
            fireEvent.click(screen.getByRole('button', { name: '히스토리 뒤로' }));
            fireEvent.click(screen.getByRole('button', { name: '히스토리 앞으로' }));
            expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/terms');
            const back = screen.getByRole('button', { name: '이전 화면으로 돌아가기' });
            expect(back).not.toHaveClass('reserve-header-back--leaving');
            expect(back).not.toBeDisabled();
        } finally {
            vi.useRealTimers();
        }
    });

    it('removes the back button at once when motion is reduced', () => {
        renderHeader('/store/12');
        fireEvent.click(screen.getByRole('link', { name: 'RESERVE 홈' }));
        expect(document.querySelector('.reserve-header-back')).toBeNull();
    });

    it('keeps the logo still on home and only scrolls to the top', () => {
        reducedMotionState.value = false;
        const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
        renderHeader();
        const logo = screen.getByRole('link', { name: 'RESERVE 홈' });
        fireEvent.click(logo);
        expect(scroll).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
        expect(logo).not.toHaveClass('reserve-header-logo--home-motion');
        scroll.mockRestore();
    });
});
