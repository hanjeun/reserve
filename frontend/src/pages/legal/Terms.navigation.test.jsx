import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Terms from './Terms';

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => motion.reduced }));
let scroll;
const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

function Navigation() {
    const navigate = useNavigate();
    const [loaded, setLoaded] = useState(false);
    return <>
        <button onClick={() => navigate('/terms#payments')}>결제 약관</button>
        <button onClick={() => navigate('/outside')}>다른 페이지</button>
        <button onClick={() => navigate(-1)}>이전 페이지</button>
        <button onClick={() => setLoaded(true)}>본문 준비</button>
        <Routes>
            <Route path="/terms" element={<Terms />} />
            <Route path="/late" element={loaded ? <Terms /> : <div>약관 로딩</div>} />
            <Route path="/outside" element={<div>다른 페이지 본문</div>} />
        </Routes>
    </>;
}
const show = (path = '/outside') => {
    const view = render(<MemoryRouter initialEntries={[path]}><Navigation /></MemoryRouter>);
    if (path === '/outside') fireEvent.click(screen.getByRole('button', { name: '결제 약관' }));
    return view;
};
const frame = () => act(() => { vi.advanceTimersByTime(16); });

beforeEach(() => {
    motion.reduced = false;
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', callback => window.setTimeout(callback, 16));
    vi.stubGlobal('cancelAnimationFrame', handle => window.clearTimeout(handle));
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scroll });
});
afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.reserveModalOpen;
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
    else delete HTMLElement.prototype.scrollIntoView;
});

it('약관 상단을 먼저 그린 뒤 결제 조항으로 부드럽게 이동하고 읽기 위치를 넘겨요', () => {
    show();
    expect(scroll).not.toHaveBeenCalled();
    frame();
    expect(window.scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 0, top: 0, behavior: 'instant' });
    expect(scroll).not.toHaveBeenCalled();
    frame();
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'smooth' });
    expect(document.getElementById('payments')).toHaveFocus();
});
it('같은 약관 페이지의 라우터 해시 변경도 이동해요', () => {
    show('/terms');
    frame(); frame();
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '결제 약관' }));
    frame(); frame();
    expect(scroll).toHaveBeenCalledOnce();
});
it('늦게 준비된 약관 본문을 기준으로 이동해요', () => {
    show('/late#payments');
    act(() => { vi.advanceTimersByTime(1000); });
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '본문 준비' }));
    frame(); frame();
    expect(scroll).toHaveBeenCalledOnce();
});
it('모달의 스크롤 잠금과 복원이 끝난 뒤 이동해요', () => {
    document.documentElement.dataset.reserveModalOpen = 'true';
    show(); frame(); frame();
    expect(scroll).not.toHaveBeenCalled();
    delete document.documentElement.dataset.reserveModalOpen;
    act(() => { document.dispatchEvent(new CustomEvent('reserve:modal-unlocked')); });
    frame(); frame();
    expect(scroll).toHaveBeenCalledOnce();
});
it.each(['wheel', 'touchStart', 'pointerDown', 'keyDown'])('사용자가 %s로 조작하면 예약된 자동 이동을 취소해요', event => {
    show(); frame();
    fireEvent[event](window, { key: 'PageDown' });
    frame();
    expect(scroll).not.toHaveBeenCalled();
});
it('페이지를 떠난 뒤에는 스크롤과 포커스를 바꾸지 않아요', () => {
    show(); frame();
    fireEvent.click(screen.getByRole('button', { name: '다른 페이지' }));
    frame();
    expect(scroll).not.toHaveBeenCalled();
});
it('모션 줄이기에서는 조항으로 즉시 이동해요', () => {
    motion.reduced = true;
    show(); frame(); frame();
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'instant' });
    expect(window.scrollTo).not.toHaveBeenCalled();
});
it('직접 해시 진입은 상단 모션을 다시 만들지 않고 조항을 표시해요', () => {
    show('/terms#payments'); frame(); frame();
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'instant' });
    expect(window.scrollTo).not.toHaveBeenCalled();
});
it('뒤로 돌아온 약관은 상단부터 이동하는 모션을 반복하지 않아요', () => {
    show(); frame(); frame();
    fireEvent.click(screen.getByRole('button', { name: '다른 페이지' }));
    scroll.mockClear();
    window.scrollTo.mockClear();
    fireEvent.click(screen.getByRole('button', { name: '이전 페이지' }));
    frame(); frame();
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: 'start', behavior: 'instant' });
    expect(window.scrollTo).not.toHaveBeenCalled();
});
