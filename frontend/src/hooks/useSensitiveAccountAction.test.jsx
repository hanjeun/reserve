import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import useSensitiveAccountAction from './useSensitiveAccountAction';
import useAuthStore from '../store/useAuthStore';
import { currentSession } from '../api/sessionScope';
const fixture = vi.hoisted(() => ({ post: vi.fn(), execute: vi.fn(), failure: vi.fn() }));
vi.mock('../api/axios', () => ({ default: { post: fixture.post } }));
vi.mock('../components/member/MfaFlow', () => ({ default: ({ onVerified, onCancel }) => <>
    <button onClick={() => onVerified({ verified: true, rememberBrowser: true })}>본인 확인</button><button onClick={onCancel}>인증 취소</button>
</> }));
function Harness() {
    const sensitive = useSensitiveAccountAction();
    const [busy, setBusy] = useState(false);
    return <>{sensitive.panel}<button disabled={busy} onClick={async () => {
        setBusy(true);
        try { await sensitive.run('LINK', 'synthetic-password', fixture.execute); }
        catch (error) { fixture.failure(error); }
        finally { setBusy(false); }
    }}>연결</button></>;
}
beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({ user: { id: 7, role: 'USER' }, sessionRevision: currentSession().epoch });
    fixture.post.mockResolvedValue({ purpose: 'MANAGE', verified: false });
    fixture.execute.mockResolvedValue({});
});
it('확인 전에는 변경 요청을 보내지 않고 확인한 같은 작업에 선택을 이어줘요', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '연결' }));
    await screen.findByRole('button', { name: '본인 확인' });
    expect(fixture.execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '본인 확인' }));
    await waitFor(() => expect(fixture.execute).toHaveBeenCalledExactlyOnceWith({ rememberBrowser: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: '연결' })).toBeEnabled());
});
it('인증을 중간에 닫으면 원래 작업을 취소하고 로딩과 원래 포커스를 복원해요', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '연결' }); trigger.focus();
    fireEvent.click(trigger);
    const cancel = await screen.findByRole('button', { name: '인증 취소' }); cancel.focus();
    fireEvent.click(cancel);
    await waitFor(() => expect(screen.getByRole('button', { name: '연결' })).toBeEnabled());
    expect(fixture.execute).not.toHaveBeenCalled();
    expect(fixture.failure).toHaveBeenCalledWith(expect.objectContaining({ name: 'AbortError' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
});
it('확인 중 계정이 바뀌면 이전 작업을 이어가지 않아요', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '연결' }));
    const oldProof = await screen.findByRole('button', { name: '본인 확인' }); oldProof.focus();
    act(() => useAuthStore.getState().login({ id: 8, role: 'USER' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '연결' })).toBeEnabled());
    expect(screen.queryByRole('button', { name: '본인 확인' })).toBeNull();
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: '연결' }));
    expect(fixture.execute).not.toHaveBeenCalled();
});
it('초기 확인 요청 실패도 로딩을 해제하고 다시 시작할 수 있어요', async () => {
    fixture.post.mockRejectedValueOnce(new Error('확인 서버에 연결하지 못했어요.'));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '연결' }));
    await waitFor(() => expect(fixture.failure).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '연결' })).toBeEnabled();
    expect(fixture.execute).not.toHaveBeenCalled();
    fixture.post.mockResolvedValue({ verified: true });
    fireEvent.click(screen.getByRole('button', { name: '연결' }));
    await waitFor(() => expect(fixture.execute).toHaveBeenCalledTimes(1));
});
