import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { LoginMethodPasswordProof, LoginMethodPasswordSetup } from './LoginMethodForms';
import PasswordTab from './PasswordTab';
import useAuthStore from '../../store/useAuthStore';

const fixture = vi.hoisted(() => ({
    message: { info: vi.fn(), error: vi.fn(), success: vi.fn() },
    onSubmit: vi.fn(), onSend: vi.fn(), onError: vi.fn(), onCancel: vi.fn(), changePassword: vi.fn(),
}));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: fixture.message }) }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: fixture.message }) }));
vi.mock('../../services', () => ({ memberService: { changePassword: fixture.changePassword } }));
const show = component => render(<AntApp><MemoryRouter>{component}</MemoryRouter></AntApp>);
const setup = (props = {}) => show(<LoginMethodPasswordSetup email="member@example.test" busy={false}
    onSend={fixture.onSend} onSubmit={fixture.onSubmit} onError={fixture.onError} onCancel={fixture.onCancel} {...props} />);

beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 7, email: 'member@example.test' }, sessionRevision: 70 });
    fixture.onSend.mockResolvedValue({ challengeId: 'challenge', expiresAt: new Date(Date.now() + 300000).toISOString() });
});

it('explains a missing current password, focuses its field and does not submit the proof', async () => {
    show(<LoginMethodPasswordProof busy={false} submitText="연결하기" onSubmit={fixture.onSubmit} onCancel={fixture.onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: '연결하기' }));
    await waitFor(() => expect(fixture.message.info).toHaveBeenCalledWith('현재 비밀번호를 먼저 입력해주세요.'));
    expect(screen.getByLabelText('현재 비밀번호')).toHaveFocus();
    expect(fixture.onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('현재 비밀번호'), { target: { value: 'Original123!' } });
    fireEvent.click(screen.getByRole('button', { name: '연결하기' }));
    await waitFor(() => expect(fixture.onSubmit).toHaveBeenCalledWith('Original123!'));
});

it('keeps the confirm and close buttons locked during an authentication request', () => {
    show(<LoginMethodPasswordProof busy submitText="연결하기" onSubmit={fixture.onSubmit} onCancel={fixture.onCancel} />);
    const submit = screen.getByRole('button', { name: '연결하기' });
    const cancel = screen.getByRole('button', { name: '닫기', exact: true });
    expect(submit).toBeDisabled();
    expect(cancel).toBeDisabled();
    fireEvent.click(submit);
    fireEvent.click(cancel);
    expect(fixture.onSubmit).not.toHaveBeenCalled();
    expect(fixture.onCancel).not.toHaveBeenCalled();
});

it('keeps missing-password submission away from the change API and shows its first validation error', async () => {
    show(<PasswordTab />);
    fireEvent.click(screen.getByRole('button', { name: '변경', exact: true }));
    await waitFor(() => expect(fixture.message.info).toHaveBeenCalledWith('현재 비밀번호를 먼저 입력해주세요.'));
    expect(screen.getByPlaceholderText('현재 비밀번호')).toHaveFocus();
    expect(fixture.changePassword).not.toHaveBeenCalled();
});

it('explains an invalid email before sending an email challenge', async () => {
    setup({ email: '' });
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }));
    await waitFor(() => expect(fixture.message.info).toHaveBeenCalledWith('이메일을 입력해주세요'));
    expect(screen.getByLabelText('로그인 이메일')).toHaveFocus();
    expect(fixture.onSend).not.toHaveBeenCalled();
    expect(fixture.onSubmit).not.toHaveBeenCalled();
});

it('explains the missing challenge instead of submitting an email login setup', () => {
    setup();
    const button = screen.getByRole('button', { name: '이메일 로그인 설정' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(button);
    expect(fixture.message.info).toHaveBeenCalledWith('먼저 이메일 인증 코드를 받아주세요.');
    expect(fixture.onSubmit).not.toHaveBeenCalled();
});

it('explains a missing code after a challenge arrives and does not set the password', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }));
    await screen.findByRole('button', { name: '인증 코드 다시 받기' });
    fireEvent.click(screen.getByRole('button', { name: '이메일 로그인 설정' }));
    await waitFor(() => expect(fixture.message.info).toHaveBeenCalledWith('6자리 인증 코드를 입력해주세요.'));
    expect(screen.getByLabelText('인증 코드')).toHaveFocus();
    expect(fixture.onSubmit).not.toHaveBeenCalled();
});

it('keeps an expired challenge from reaching password setup even when every input is valid', async () => {
    fixture.onSend.mockResolvedValue({ challengeId: 'expired', expiresAt: new Date(Date.now() - 1000).toISOString() });
    setup();
    fireEvent.click(screen.getByRole('button', { name: '인증 코드 받기' }));
    await screen.findByRole('button', { name: '인증 코드 다시 받기' });
    fireEvent.change(screen.getByLabelText('인증 코드'), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText('비밀번호', { exact: true }), { target: { value: 'NewPass123!' } });
    fireEvent.change(screen.getByLabelText('비밀번호 확인'), { target: { value: 'NewPass123!' } });
    fireEvent.click(screen.getByRole('button', { name: '이메일 로그인 설정' }));
    await waitFor(() => expect(fixture.onError).toHaveBeenCalledWith('인증 코드가 만료됐어요. 다시 받아주세요.'));
    expect(fixture.onSubmit).not.toHaveBeenCalled();
});
