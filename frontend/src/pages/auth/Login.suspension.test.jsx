import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Login from './Login';

const api = vi.hoisted(() => ({ post: vi.fn() }));
const feedback = vi.hoisted(() => ({ message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));
vi.mock('../../api/axios', () => ({ default: api }));
vi.mock('../../store/useAuthStore', () => ({ default: () => ({ isLoggedIn: false, login: vi.fn() }) }));
vi.mock('../../hooks', () => ({ useMessage: () => feedback }));
vi.mock('../../hooks/useDocumentTitle', () => ({ default: () => {} }));
vi.mock('../../components/common/icons', async importOriginal => ({ ...await importOriginal(), ExclamationCircleFilled: () => null }));
vi.mock('../../components/common/IconTool', () => ({ default: ({ label, onClick }) => <button type="button" aria-label={label} onClick={onClick} /> }));
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
        Checkbox: ({ children, ...props }) => <label><input type="checkbox" {...props} />{children}</label>,
        Modal: ({ title, open, children, onOk }) => open ? <section role="dialog">{title}{children}
            <button type="button" onClick={onOk}>확인</button></section> : null,
    };
});

const Address = () => <output data-testid="address">{useLocation().search}</output>;

describe('social and email suspension notices', () => {
    beforeEach(() => { vi.clearAllMocks(); window.history.replaceState({}, '', '/login'); });
    afterEach(() => window.history.replaceState({}, '', '/'));
    const show = url => {
        window.history.replaceState({}, '', url);
        return render(<React.StrictMode><MemoryRouter initialEntries={[url]}><Address /><Login /></MemoryRouter></React.StrictMode>);
    };

    it.each([
        ['SUSPENDED', '이용이 제한된 계정이에요'],
        ['BANNED', '영구 정지된 계정이에요'],
    ])('displays only verified %s status and clears the result from the address', async (status, title) => {
        const reference = '00000000-0000-4000-a000-000000000001';
        api.post.mockResolvedValueOnce({ code: 'account_restricted', status, until: '2026-10-02' });
        show('/login?error=oauth2&result=' + reference);
        expect(await screen.findByRole('dialog')).toHaveTextContent(title);
        if (status === 'SUSPENDED') expect(screen.getByRole('dialog')).toHaveTextContent('2026-10-02까지');
        await waitFor(() => expect(screen.getByTestId('address')).toBeEmptyDOMElement());
        expect(api.post).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole('button', { name: '확인' }));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('ignores an address-supplied account suspension', async () => {
        show('/login?suspended=true&status=BANNED&until=2026-10-02');
        await waitFor(() => expect(screen.getByTestId('address')).toBeEmptyDOMElement());
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(api.post).not.toHaveBeenCalled();
    });

    it('does not render suspension when the browser has no verified result', async () => {
        api.post.mockResolvedValueOnce(null);
        show('/login?error=oauth2&result=00000000-0000-4000-a000-000000000001&status=BANNED');
        await waitFor(() => expect(screen.getByTestId('address')).toBeEmptyDOMElement());
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(api.post).toHaveBeenCalledOnce();
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
