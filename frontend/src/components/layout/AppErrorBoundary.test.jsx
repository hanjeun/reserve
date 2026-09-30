import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { AppErrorBoundary, RouteErrorBoundary } from './AppErrorBoundary';

const state = { throws: true, error: new Error('render failed') };
function Flaky() {
    if (state.throws) throw state.error;
    return <p>정상 화면</p>;
}

function Navigator() {
    const navigate = useNavigate();
    const { pathname } = useLocation();
    return <>
        <output aria-label="현재 경로">{pathname}</output>
        <button type="button" onClick={() => navigate('/elsewhere')}>다른 화면</button>
    </>;
}

const renderRoute = (path = '/broken') => render(
    <MemoryRouter initialEntries={[path]}>
        <Navigator />
        <RouteErrorBoundary><Flaky /></RouteErrorBoundary>
    </MemoryRouter>,
);

describe('render error boundaries', () => {
    let reload;
    beforeEach(() => {
        state.throws = true;
        state.error = new Error('render failed');
        vi.spyOn(console, 'error').mockImplementation(() => {});
        reload = vi.fn();
        vi.stubGlobal('location', { ...window.location, reload, assign: vi.fn() });
    });
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('shows the route fallback instead of blanking, and retry re-renders the children', () => {
        renderRoute();

        expect(screen.getByRole('alert')).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 1, name: '문제가 생겼어요' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: '홈으로' })).toBeInTheDocument();

        state.throws = false;
        fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
        expect(screen.getByText('정상 화면')).toBeInTheDocument();
    });

    it('resets itself when the address changes without remounting on every navigation', () => {
        renderRoute();
        expect(screen.getByRole('heading', { name: '문제가 생겼어요' })).toBeInTheDocument();

        state.throws = false;
        fireEvent.click(screen.getByRole('button', { name: '다른 화면' }));

        expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/elsewhere');
        expect(screen.getByText('정상 화면')).toBeInTheDocument();
    });

    it('sends 홈으로 to the root and clears the error', () => {
        renderRoute();
        state.throws = false;
        fireEvent.click(screen.getByRole('button', { name: '홈으로' }));

        expect(screen.getByLabelText('현재 경로')).toHaveTextContent(/^\/$/);
        expect(screen.getByText('정상 화면')).toBeInTheDocument();
    });

    it('leads with reload for a stale lazy chunk because retry cannot re-import it', () => {
        state.error = new TypeError('Failed to fetch dynamically imported module: https://reserve.it.kr/assets/Terms-abc12345.js');
        renderRoute();

        expect(screen.getByRole('heading', { name: '화면을 불러오지 못했어요' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '다시 시도' })).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
        expect(reload).toHaveBeenCalledOnce();
    });

    it('catches shell errors outside the router, with a full-document home link and retry', () => {
        render(<AppErrorBoundary><Flaky /></AppErrorBoundary>);

        expect(screen.getByRole('heading', { name: '문제가 생겼어요' })).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '홈으로' }));
        expect(window.location.assign).toHaveBeenCalledWith('/');

        state.throws = false;
        fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
        expect(screen.getByText('정상 화면')).toBeInTheDocument();
    });
});
