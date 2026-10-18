import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import ScrollToTop from './ScrollToTop';

let top;
let contentHeight;
const scrollDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY');
const heightDescriptor = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight');

function Navigation() {
    const navigate = useNavigate();
    const location = useLocation();
    return <>
        <ScrollToTop />
        <output aria-label="현재 경로">{location.pathname}{location.search}</output>
        <button onClick={() => navigate('/messages?storeId=42')}>메시지</button>
        <button onClick={() => navigate('/messages', { replace: true })}>대화 목록</button>
        <button onClick={() => navigate(-1)}>이전</button>
        <button onClick={() => navigate('/store/42')}>같은 가게 새 방문</button>
        <button onClick={() => navigate('/my-page')}>다른 화면</button>
        <main className="ant-layout-content">본문</main>
    </>;
}

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(150); });
const leaveStore = () => {
    top = 640;
    fireEvent.scroll(window);
    fireEvent.click(screen.getByRole('button', { name: '메시지', exact: true }));
    expect(screen.getByLabelText('현재 경로')).toHaveTextContent('/messages?storeId=42');
};

describe('messenger return scroll boundary', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        top = 0;
        contentHeight = 5000;
        Object.defineProperty(window, 'scrollY', { configurable: true, get: () => top });
        Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => contentHeight });
        vi.stubGlobal('requestAnimationFrame', callback => window.setTimeout(callback, 16));
        vi.stubGlobal('cancelAnimationFrame', handle => window.clearTimeout(handle));
        vi.spyOn(window, 'scrollTo').mockImplementation(position => { top = position.top; });
        render(<MemoryRouter initialEntries={['/store/42']}><Navigation /></MemoryRouter>);
    });

    afterEach(() => {
        cleanup();
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        if (scrollDescriptor) Object.defineProperty(window, 'scrollY', scrollDescriptor);
        else delete window.scrollY;
        if (heightDescriptor) Object.defineProperty(document.documentElement, 'scrollHeight', heightDescriptor);
        else delete document.documentElement.scrollHeight;
    });

    it('restores the store position after closing messages through history', async () => {
        leaveStore();
        expect(top).toBe(0);
        fireEvent.click(screen.getByRole('button', { name: '이전', exact: true }));
        await settle();
        expect(top).toBe(640);
    });

    it('keeps the return position when the messages query is replaced', async () => {
        leaveStore();
        fireEvent.click(screen.getByRole('button', { name: '대화 목록', exact: true }));
        fireEvent.click(screen.getByRole('button', { name: '이전', exact: true }));
        await settle();
        expect(top).toBe(640);
    });

    it('does not reuse a previous entry position for a new visit to the same URL', async () => {
        leaveStore();
        fireEvent.click(screen.getByRole('button', { name: '같은 가게 새 방문', exact: true }));
        await settle();
        expect(top).toBe(0);
    });

    it('keeps the existing top policy for other destinations', async () => {
        leaveStore();
        fireEvent.click(screen.getByRole('button', { name: '다른 화면', exact: true }));
        await settle();
        expect(top).toBe(0);
    });

    it('waits for return content and stops correcting after the user scrolls', async () => {
        leaveStore();
        contentHeight = 800;
        fireEvent.click(screen.getByRole('button', { name: '이전', exact: true }));
        await settle();
        expect(top).toBe(0);
        fireEvent.wheel(window);
        top = 120;
        fireEvent.scroll(window);
        contentHeight = 5000;
        await settle();
        expect(top).toBe(120);
    });
});
