import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const api = vi.hoisted(() => ({ post: vi.fn() }));
const feedback = vi.hoisted(() => ({ message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('../../api/axios', () => ({ default: api }));
vi.mock('../../store/useAuthStore', () => ({ default: () => ({ isLoggedIn: false, login: vi.fn() }) }));
vi.mock('../../hooks', () => ({ useMessage: () => feedback }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('@ant-design/icons', () => ({ ExclamationCircleFilled: () => null }));
vi.mock('../../components/common', () => ({
    PageContainer: ({ children }) => <main>{children}</main>,
    FormInput: () => <input />,
    Button: ({ children, onClick, htmlType }) => <button type={htmlType ?? 'button'} onClick={onClick}>{children}</button>,
}));
vi.mock('antd', () => {
    const Form = ({ children, onFinish }) => <form aria-label="로그인" onSubmit={event => {
        event.preventDefault(); onFinish({ email: 'member@example.com', password: 'test-only' });
    }}>{children}</form>;
    Form.Item = ({ children }) => <div>{children}</div>;
    return {
        Form, Typography: {
            Title: ({ children }) => <h2>{children}</h2>,
            Paragraph: ({ children }) => <p>{children}</p>,
            Text: ({ children }) => <span>{children}</span>,
        },
        Divider: ({ children }) => <div>{children}</div>, Flex: ({ children }) => <div>{children}</div>,
        Modal: ({ title, open, children, onOk }) => open ? <section role="dialog">{title}{children}
            <button type="button" onClick={onOk}>확인</button></section> : null,
    };
});

describe('social and email suspension notices', () => {
    beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/login'); });
    afterEach(() => window.history.replaceState({}, '', '/'));
    const show = url => {
        window.history.replaceState({}, '', url);
        return render(<React.StrictMode><MemoryRouter initialEntries={[url]}><Login /></MemoryRouter></React.StrictMode>);
    };

    it.each([
        ['SUSPENDED', '이용이 제한된 계정이에요'],
        ['BANNED', '영구 정지된 계정이에요'],
    ])('keeps the %s notice visible after the social redirect query is cleared', (status, title) => {
        const rendered = show(`/login?suspended=true&status=${status}&until=2026-10-02`);
        expect(screen.getByRole('dialog')).toHaveTextContent(title);
        if (status === 'SUSPENDED') expect(screen.getByRole('dialog')).toHaveTextContent('2026-10-02까지');
        expect(window.location.search).toBe('');
        fireEvent.click(screen.getByRole('button', { name: '확인' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        rendered.rerender(<React.StrictMode><MemoryRouter initialEntries={['/login']}><Login /></MemoryRouter></React.StrictMode>);
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('still uses structured suspension data from an email login failure', async () => {
        api.post.mockRejectedValueOnce({ data: { status: 'SUSPENDED', until: '2026-10-03', reason: '테스트 안내' } });
        show('/login');
        expect(screen.queryByRole('dialog')).toBeNull();
        fireEvent.submit(screen.getByRole('form', { name: '로그인' }));
        expect(await screen.findByRole('dialog')).toHaveTextContent('테스트 안내');
        expect(screen.getByRole('dialog')).toHaveTextContent('2026-10-03까지');
        expect(feedback.message.error).not.toHaveBeenCalled();
    });
});
