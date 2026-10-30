import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ProfileImageTab from './ProfileImageTab';

const fixture = vi.hoisted(() => ({
    reduced: false, upload: vi.fn(), remove: vi.fn(), checkAuth: vi.fn(), confirm: vi.fn(),
    message: { success: vi.fn(), error: vi.fn() }, file: null,
}));
vi.mock('../../services', () => ({ memberService: { uploadProfileImage: fixture.upload, deleteProfileImage: fixture.remove } }));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: fixture.message, confirm: fixture.confirm }) }));
vi.mock('../../hooks/useReducedMotion', () => ({ default: () => fixture.reduced }));
vi.mock('../../store/useAuthStore', () => ({ default: { getState: () => ({ checkAuth: fixture.checkAuth }) } }));
vi.mock('../../components/common', () => ({
    Button: ({ children, disabled, loading, onClick }) => <button type="button" disabled={disabled || loading} onClick={onClick}>{children}</button>,
}));
vi.mock('../common/ProfilePhotoPicker', () => ({ default: ({ src, disabled, onSelect }) => <>
    <output aria-label="사진 미리보기">{src || 'default'}</output>
    <button type="button" disabled={disabled} onClick={() => onSelect(fixture.file)}>사진 선택</button>
</> }));

const show = () => render(<ProfileImageTab user={{ profileImageUrl: '/account.png' }} />);
beforeEach(() => {
    vi.resetAllMocks();
    fixture.reduced = false;
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
