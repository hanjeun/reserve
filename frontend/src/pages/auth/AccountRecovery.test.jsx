import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AccountRecovery from './AccountRecovery';

const fixture = vi.hoisted(() => ({ post: vi.fn(), message: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../../api/axios', () => ({ default: { post: fixture.post } }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: fixture.message }) }));

const RECOVERY = '/account-recovery';
const fixtureKey = 'x'.repeat(43);

function LocationProbe() {
    const { hash, search } = useLocation();
    return <span data-testid="recovery-location" data-hash-removed={hash === ''}>{search}</span>;
}

const show = path => render(<MemoryRouter initialEntries={[path]}>
    <ConfigProvider theme={{ token: { motion: false } }}><AccountRecovery /><LocationProbe /></ConfigProvider>
</MemoryRouter>);

beforeEach(() => vi.resetAllMocks());

it('탈퇴 경로에는 탈퇴 안내와 가입·로그인 링크가 표시돼요', () => {
    show(`${RECOVERY}?type=withdrawn`);
    expect(screen.getByRole('heading', { name: '탈퇴한 계정' })).toBeVisible();
    expect(screen.getByRole('link', { name: '회원가입' })).toHaveAttribute('href', '/signup');
    expect(screen.getByRole('link', { name: '로그인으로 돌아가기' })).toHaveAttribute('href', '/login');
    expect(screen.queryByPlaceholderText('보안 이메일 주소')).not.toBeInTheDocument();
    expect(fixture.post).not.toHaveBeenCalled();
});

it('잠긴 계정의 보안 이메일 확인 뒤 기존 인증 수단으로 이어져요', async () => {
    fixture.post.mockResolvedValueOnce({ reference: fixtureKey, expiresAt: new Date(Date.now() + 300_000).toISOString() })
        .mockRejectedValueOnce({ status: 400 }).mockResolvedValueOnce({ totpAvailable: true });
    show(RECOVERY);
    expect(screen.getByRole('heading', { name: '잠긴 계정 복구' })).toBeVisible();
    expect(screen.getByRole('link', { name: '로그인으로 돌아가기' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('radio', { name: '탈퇴한 계정' })).not.toBeInTheDocument();
    expect(fixture.post).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('보안 이메일 주소'), { target: { value: 'fixture@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '코드발송', exact: true }));
    const codeInput = await screen.findByPlaceholderText('6자리 인증번호');
    expect(screen.getByText(/복구 가능한 계정이면 등록된 보안 이메일로 코드를 보내요/)).toBeVisible();
    expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/api/auth/account-recovery/email/send-code', { email: 'fixture@example.test' },
        { skipAuthRefresh: true, signal: expect.any(AbortSignal) });
    fireEvent.change(codeInput, { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: '확인', exact: true }));
    expect(await screen.findByText(/인증 코드를 확인하지 못했어요/)).toBeVisible();
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '확인', exact: true }));
    expect(await screen.findByRole('textbox', { name: '인증 앱 코드' })).toBeVisible();
    expect(fixture.post).toHaveBeenLastCalledWith('/api/auth/account-recovery/email/verify-code', { reference: fixtureKey, code: '123456' },
        { skipAuthRefresh: true, signal: expect.any(AbortSignal) });
});

it('메일 링크의 키를 주소에서 지우고 명시적으로 시작한 뒤에만 본인 확인을 요청해요', async () => {
    fixture.post.mockResolvedValueOnce({ totpAvailable: true }).mockResolvedValueOnce({ notificationSubmitted: true });
    show(`${RECOVERY}#key=${fixtureKey}`);
    const start = screen.getByRole('button', { name: '복구 시작' });
    expect(screen.getByTestId('recovery-location')).toHaveAttribute('data-hash-removed', 'true');
    expect(screen.queryByRole('radiogroup', { name: '계정 복구 안내' })).not.toBeInTheDocument();
    expect(fixture.post).not.toHaveBeenCalled();

    fireEvent.click(start);
    const codeInput = await screen.findByRole('textbox', { name: '인증 앱 코드' });
    expect(fixture.post).toHaveBeenCalledExactlyOnceWith('/api/auth/account-recovery/start', { key: fixtureKey },
        { skipAuthRefresh: true, signal: expect.any(AbortSignal) });
    fireEvent.change(codeInput, { target: { value: '123456' } });
    fireEvent.submit(codeInput.closest('form'));
    await waitFor(() => expect(screen.getByRole('heading', { name: '계정 복구를 완료했어요' })).toBeVisible());
    expect(fixture.post).toHaveBeenLastCalledWith('/api/auth/account-recovery/complete', { kind: 'TOTP', proof: '123456' },
        { skipAuthRefresh: true, signal: expect.any(AbortSignal) });
});

it('만료된 메일 링크에서는 이메일 코드로 다시 시작할 수 있어요', async () => {
    fixture.post.mockRejectedValueOnce({ status: 401 });
    show(`${RECOVERY}#key=${fixtureKey}`);
    fireEvent.click(screen.getByRole('button', { name: '복구 시작' }));
    expect(await screen.findByRole('status')).toHaveTextContent('보안 이메일로 코드를 다시 받아주세요.');
    expect(screen.getByPlaceholderText('보안 이메일 주소')).toBeVisible();
    expect(screen.getByRole('link', { name: '문의하기' })).toHaveAttribute('href', '/?inquiry=open');
    expect(screen.queryByRole('button', { name: '복구 시작' })).not.toBeInTheDocument();
});
