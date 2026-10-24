import { fireEvent, render, screen } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Signup from './Signup';
import SocialAgreement from './SocialAgreement';

const fixture = vi.hoisted(() => ({ message: { error: vi.fn(), success: vi.fn() }, post: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: { post: fixture.post } }));
vi.mock('../../store/useAuthStore', () => ({ default: () => ({ isLoggedIn: false, user: null }) }));
vi.mock('../../hooks', () => ({
    useMessage: () => ({ message: fixture.message }),
    useEmailVerification: () => ({ isCodeSent: false, isVerified: false }),
    useFormErrors: () => ({ errors: {}, clearError: vi.fn(), validate: vi.fn() }),
}));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

it.each([
    ['/signup', Signup, 0, '서비스 이용약관'],
    ['/signup', Signup, 1, '개인정보 처리방침'],
    ['/signup/social', SocialAgreement, 0, '서비스 이용약관'],
    ['/signup/social', SocialAgreement, 1, '개인정보 처리방침'],
])('%s opens legal document %s in the current SPA without submitting or opening a window', (path, Page, index, title) => {
    const popup = vi.spyOn(window, 'open').mockImplementation(() => null);
    render(<MemoryRouter initialEntries={[path]}><AntApp><Routes>
        <Route path={path} element={<Page />} />
        <Route path="/terms" element={<h1>서비스 이용약관</h1>} />
        <Route path="/privacy" element={<h1>개인정보 처리방침</h1>} />
    </Routes></AntApp></MemoryRouter>);
    fireEvent.click(screen.getAllByRole('button', { name: '보기', exact: true })[index]);
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(popup).not.toHaveBeenCalled();
    expect(fixture.post).not.toHaveBeenCalled();
});
