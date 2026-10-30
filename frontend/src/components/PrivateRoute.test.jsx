import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import PrivateRoute from './PrivateRoute';
import useAuthStore from '../store/useAuthStore';
import { clearRedirect, pathFromLocation, peekRedirect } from '../utils/redirect';

vi.mock('../api/axios', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../hooks/useMessage', () => ({ default: () => ({ message: { error: vi.fn() } }) }));

function LoginDestination() {
    const location = useLocation();
    return <><h1>로그인 화면</h1><output aria-label="로그인 뒤 목적지">{pathFromLocation(location.state?.from)}</output></>;
}

beforeEach(() => {
    clearRedirect();
    useAuthStore.getState().login({ id: 7, role: 'USER', termsAgreed: true });
});

it.each(['/messages?storeId=14#conversation', '/my-reservations'])('opens login after completed logout and preserves the requested destination: %s', async destination => {
    render(<MemoryRouter initialEntries={['/feed/posts/3']}>
        <Routes>
            <Route path="/feed/posts/3" element={<Link to={destination}>문의하기</Link>} />
            <Route path="/" element={<h1>홈</h1>} />
            <Route path="/login" element={<LoginDestination />} />
            <Route element={<PrivateRoute />}>
                <Route path="/messages" element={<h1>비공개 대화</h1>} />
                <Route path="/my-reservations" element={<h1>비공개 예약</h1>} />
            </Route>
        </Routes>
    </MemoryRouter>);
    act(() => {
        useAuthStore.getState().setLoggingOut(true);
        useAuthStore.getState().logout();
    });
    fireEvent.click(screen.getByRole('link', { name: '문의하기' }));
    expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument();
    expect(screen.getByLabelText('로그인 뒤 목적지')).toHaveTextContent(destination);
    expect(peekRedirect()).toBe(destination);
    expect(screen.queryByRole('heading', { name: /비공개/ })).not.toBeInTheDocument();
});
