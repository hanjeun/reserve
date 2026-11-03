import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProfileImageTab from './ProfileImageTab';

const fixture = vi.hoisted(() => ({
    reduced: false, upload: vi.fn(), remove: vi.fn(), checkAuth: vi.fn(), confirm: vi.fn(), auth: null,
    message: { success: vi.fn(), error: vi.fn() }, file: null,
}));
vi.mock('../../services', () => ({ memberService: { uploadProfileImage: fixture.upload, deleteProfileImage: fixture.remove } }));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: fixture.message, confirm: fixture.confirm }) }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => fixture.reduced }));
vi.mock('../../store/useAuthStore', () => {
    const store = selector => selector(fixture.auth);
    store.getState = () => fixture.auth;
    return { default: store };
});
vi.mock('../../components/common', () => ({
    Button: ({ children, disabled, loading, onClick }) => <button type="button" disabled={disabled || loading} onClick={onClick}>{children}</button>,
}));
vi.mock('../common/ProfilePhotoPicker', () => ({ default: ({ src, disabled, onSelect }) => <>
    <output aria-label="사진 미리보기">{src || 'default'}</output>
    <button type="button" disabled={disabled} onClick={() => onSelect(fixture.file)}>사진 선택</button>
</> }));

const user = { id: 7, role: 'USER', profileImageUrl: '/account.png' };
const show = () => render(<ProfileImageTab user={user} />);
beforeEach(() => {
    vi.resetAllMocks();
    fixture.reduced = false;
    fixture.auth = { user, isLoggedIn: true, sessionRevision: 1, checkAuth: fixture.checkAuth };
    fixture.file = new File(['selected'], 'photo.png', { type: 'image/png' });
    fixture.upload.mockResolvedValue({});
    fixture.checkAuth.mockResolvedValue({});
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL() { return 'blob:selected-photo'; }
        static revokeObjectURL() {}
    });
});
afterEach(() => vi.unstubAllGlobals());

it('collapses the selected-photo actions before restoring reset without saving', async () => {
    const { container } = show();
    expect(screen.getByRole('button', { name: '기본 이미지로 변경' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));
    const save = await screen.findByRole('button', { name: '저장', exact: true });
    const actions = save.closest('.reserve-profile-photo-actions');
    expect(actions.style.animation).toContain('reserve-feed-replies-enter');
    expect(actions.style.gridTemplateRows).toBe('1fr');
    expect(container.querySelector('[inert]')).toHaveTextContent('기본 이미지로 변경');
    expect(screen.queryByRole('button', { name: '기본 이미지로 변경' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '취소', exact: true }));
    expect(actions.style.animation).toContain('reserve-feed-replies-exit');
    expect(actions).toHaveAttribute('inert');
    expect(actions).toHaveAttribute('aria-hidden', 'true');
    await waitFor(() => expect(actions).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '기본 이미지로 변경' })).toBeEnabled();
    expect(screen.getByLabelText('사진 미리보기')).toHaveTextContent('/account.png');
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.checkAuth).not.toHaveBeenCalled();
});

it('keeps photo upload and explicit default-reset confirmation at their existing boundaries', async () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));
    fireEvent.click(await screen.findByRole('button', { name: '저장', exact: true }));
    await waitFor(() => expect(fixture.upload).toHaveBeenCalledWith(fixture.file));
    await screen.findByRole('button', { name: '기본 이미지로 변경' });
    expect(fixture.checkAuth).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: '기본 이미지로 변경' }));
    expect(fixture.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '기본 이미지로 변경', onOk: expect.any(Function) }));
    expect(fixture.remove).not.toHaveBeenCalled();
});

it('skips movement for reduced motion while preserving cancellation', async () => {
    fixture.reduced = true;
    show();
    fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));
    const save = await screen.findByRole('button', { name: '저장', exact: true });
    const actions = save.closest('.reserve-profile-photo-actions');
    expect(actions.style.animation).toBe('none');
    fireEvent.click(screen.getByRole('button', { name: '취소', exact: true }));
    await waitFor(() => expect(actions).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '기본 이미지로 변경' })).toBeEnabled();
    expect(fixture.upload).not.toHaveBeenCalled();
});

it.each([
    ['another member', { user: { id: 8, role: 'USER' } }],
    ['another role', { user: { id: 7, role: 'ADMIN' } }],
    ['a new session for the same member', { sessionRevision: 2 }],
    ['logout', { isLoggedIn: false }],
])('does not execute an old reset confirmation after %s', async (_, change) => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '기본 이미지로 변경' }));
    const confirmation = fixture.confirm.mock.calls[0][0];
    fixture.auth = { ...fixture.auth, ...change };
    await confirmation.onOk();
    expect(fixture.remove).not.toHaveBeenCalled();
    expect(fixture.checkAuth).not.toHaveBeenCalled();
    expect(fixture.message.success).not.toHaveBeenCalled();
});

it('does not execute a reset confirmation retained after unmount', async () => {
    const view = show();
    fireEvent.click(screen.getByRole('button', { name: '기본 이미지로 변경' }));
    const confirmation = fixture.confirm.mock.calls[0][0];
    view.unmount();
    await confirmation.onOk();
    expect(fixture.remove).not.toHaveBeenCalled();
});

it('permits a new reset after cancellation and executes a confirmed reset once', async () => {
    show();
    const reset = screen.getByRole('button', { name: '기본 이미지로 변경' });
    fireEvent.click(reset);
    fireEvent.click(reset);
    expect(fixture.confirm).toHaveBeenCalledTimes(1);
    const cancelled = fixture.confirm.mock.calls[0][0];
    cancelled.onCancel();
    fireEvent.click(reset);
    expect(fixture.confirm).toHaveBeenCalledTimes(2);
    await cancelled.onOk();
    expect(fixture.remove).not.toHaveBeenCalled();
    const confirmation = fixture.confirm.mock.calls[1][0];
    await act(async () => { await Promise.all([confirmation.onOk(), confirmation.onOk()]); });
    expect(fixture.remove).toHaveBeenCalledTimes(1);
    expect(fixture.checkAuth).toHaveBeenCalledWith(true);
    expect(fixture.message.success).toHaveBeenCalledWith('기본 이미지로 변경됐어요');
});

it.each([['upload', false], ['remove', false], ['upload', true], ['remove', true]])(
    'ignores a late %s response after the session changes (failure: %s)', async (operation, fails) => {
    let finish;
    fixture[operation].mockReturnValue(new Promise((resolve, reject) => { finish = fails ? reject : resolve; }));
    show();
    let completion;
    if (operation === 'upload') {
        fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));
        fireEvent.click(await screen.findByRole('button', { name: '저장', exact: true }));
    } else {
        fireEvent.click(screen.getByRole('button', { name: '기본 이미지로 변경' }));
        act(() => { completion = fixture.confirm.mock.calls[0][0].onOk(); });
    }
    fixture.auth = { ...fixture.auth, sessionRevision: 2 };
    await act(async () => { finish(fails ? new Error('synthetic late failure') : {}); await completion; });
    await waitFor(() => expect(fixture[operation]).toHaveBeenCalledTimes(1));
    expect(fixture.checkAuth).not.toHaveBeenCalled();
    expect(fixture.message.success).not.toHaveBeenCalled();
    expect(fixture.message.error).not.toHaveBeenCalled();
});

it('does not report success if the session changes during the profile refresh', async () => {
    let finish;
    fixture.checkAuth.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    show();
    fireEvent.click(screen.getByRole('button', { name: '기본 이미지로 변경' }));
    let completion;
    await act(async () => { completion = fixture.confirm.mock.calls[0][0].onOk(); });
    expect(fixture.checkAuth).toHaveBeenCalledWith(true);
    fixture.auth = { ...fixture.auth, sessionRevision: 2 };
    await act(async () => { finish({}); await completion; });
    expect(fixture.message.success).not.toHaveBeenCalled();
});

it('reports a current failure and permits retry without losing the selected photo', async () => {
    fixture.upload.mockRejectedValueOnce(new Error('synthetic failure'));
    show();
    fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));
    fireEvent.click(await screen.findByRole('button', { name: '저장', exact: true }));
    await waitFor(() => expect(fixture.message.error).toHaveBeenCalled());
    expect(screen.getByLabelText('사진 미리보기')).toHaveTextContent('blob:selected-photo');
    fireEvent.click(screen.getByRole('button', { name: '저장', exact: true }));
    await waitFor(() => expect(fixture.upload).toHaveBeenCalledTimes(2));
    expect(fixture.checkAuth).toHaveBeenCalledTimes(1);
});
