import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PublicProfileTab from './PublicProfileTab';

const state = vi.hoisted(() => ({ profile: {}, save: vi.fn() }));
vi.mock('../../hooks/feedQueries', () => ({
    useFeedProfile: () => state.profile,
}));
vi.mock('../../hooks/useSaveFeedProfile', () => ({
    default: () => ({ isPending: false, mutateAsync: state.save }),
}));
vi.mock('../../api/sessionScope', () => ({ currentSession: () => ({ epoch: 1 }) }));
vi.mock('../../store/useAuthStore', () => ({
    default: selector => selector({ user: { id: 7 }, sessionRevision: 1 }),
}));
vi.mock('../../utils/feedCommentProfileNavigation', () => ({ readFeedCommentForProfile: () => null }));
vi.mock('../common', () => ({
    Button: ({ children, htmlType, disabled }) => <button type={htmlType} disabled={disabled}>{children}</button>,
    DataState: ({ title, onRetry }) => <div><p>{title}</p><button onClick={onRetry}>다시 불러오기</button></div>,
}));
vi.mock('../common/IconTool', () => ({ default: ({ label, to, disabled, onClick }) => to && !disabled
    ? <a href={to} aria-label={label}>{label}</a> : <button type="button" disabled={disabled} onClick={onClick}>{label}</button> }));
vi.mock('../feed/FeedProfileFields', async () => {
    const { Form, Input } = await import('antd');
    return { default: ({ avatarField, nicknameTool }) => <>
        {avatarField}
        <Form.Item name="nickname" label="공개 닉네임"><Input suffix={nicknameTool} /></Form.Item>
        <Form.Item name="bio" label="소개"><Input /></Form.Item>
        <Form.Item name="visibility" label="프로필 공개 범위">
            <select><option value="PRIVATE">나만 보기</option><option value="MEMBERS">로그인한 회원만</option></select>
        </Form.Item>
    </> };
});
vi.mock('../common/ProfilePhotoPicker', () => ({
    default: ({ src, onSelect }) => <>
        <button type="button" onClick={() => {
            onSelect(new File(['selected'], 'avatar.png', { type: 'image/png' }));
        }}>사진 선택</button>
        {src && <img src={src} alt="선택한 사진" />}
    </>,
}));

const view = () => <MemoryRouter><PublicProfileTab /></MemoryRouter>;
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
    state.profile = { data: { nickname: '기존 이름', bio: '', avatarSource: 'ACCOUNT' }, refetch: vi.fn() };
    state.save.mockReset().mockResolvedValue({});
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL() { return 'blob:selected-avatar'; }
        static revokeObjectURL() {}
    });
});

describe('public profile background read preservation', () => {
    it('places the existing profile link in the photo title row', () => {
        const publicId = '11111111-1111-4111-8111-111111111111';
        state.profile.data = { ...state.profile.data, publicId };
        render(view());
        const link = screen.getByRole('link', { name: '내 프로필 보기' });
        expect(link).toHaveAttribute('href', '/feed/u/' + publicId);
        expect(link.closest('.ant-form-item-label')).toHaveTextContent('프로필 사진');
        expect(link.closest('.reserve-account-public-profile-avatar')).not.toBeNull();
        expect(link.closest('.reserve-account-public-profile-actions')).toBeNull();
    });

    it('does not render a profile link for a missing or invalid public address', () => {
        state.profile.data = { ...state.profile.data, publicId: 'undefined' };
        render(view());
        expect(screen.queryByRole('link', { name: '내 프로필 보기' })).toBeNull();
    });

    it('retains the actual editor values and selected photo after a transient profile failure', () => {
        const { rerender } = render(view());
        fireEvent.change(screen.getByLabelText('공개 닉네임'), { target: { value: '작성 중 이름' } });
        fireEvent.change(screen.getByLabelText('소개'), { target: { value: '작성 중 소개' } });
        fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));
        state.profile = { ...state.profile, isError: true, error: { status: 503 } };
        rerender(view());
        expect(screen.getByLabelText('공개 닉네임')).toHaveValue('작성 중 이름');
        expect(screen.getByLabelText('소개')).toHaveValue('작성 중 소개');
        expect(screen.getByAltText('선택한 사진')).toHaveAttribute('src', 'blob:selected-avatar');
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(state.profile.refetch).toHaveBeenCalledOnce();
    });

    it('retains an editor initialized without a public profile when a background read fails', () => {
        state.profile.data = null;
        const { rerender } = render(view());
        fireEvent.change(screen.getByLabelText('공개 닉네임'), { target: { value: '첫 닉네임' } });
        state.profile = { ...state.profile, isError: true, error: { status: 502 } };
        rerender(view());
        expect(screen.getByLabelText('공개 닉네임')).toHaveValue('첫 닉네임');
    });

    it('submits the photo and selected visibility from the same form', async () => {
        render(view());
        expect(screen.getByLabelText('프로필 공개 범위')).toHaveValue('PRIVATE');
        fireEvent.change(screen.getByLabelText('프로필 공개 범위'), { target: { value: 'MEMBERS' } });
        fireEvent.click(screen.getByRole('button', { name: '사진 선택' }));
        fireEvent.click(screen.getByRole('button', { name: '저장', exact: true }));
        await waitFor(() => expect(state.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
            visibility: 'MEMBERS', nickname: '기존 이름', avatarFile: expect.any(File), resetPhoto: false, session: 1,
        })));
    });

    it('changes the public nickname suggestion without saving or changing the visibility', async () => {
        render(view());
        const nickname = screen.getByLabelText('공개 닉네임');
        const suggest = screen.getByRole('button', { name: '랜덤 닉네임' });
        fireEvent.click(suggest);
        const first = nickname.value;
        expect(first).not.toBe('기존 이름');
        expect(first.length).toBeGreaterThan(0);
        fireEvent.click(suggest);
        expect(nickname.value).not.toBe(first);
        expect(screen.getByLabelText('프로필 공개 범위')).toHaveValue('PRIVATE');
        expect(state.save).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: '저장', exact: true }));
        await waitFor(() => expect(state.save).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ nickname: nickname.value, visibility: 'PRIVATE' })));
    });

    it('hides cached profile data after access is denied', () => {
        const { rerender } = render(view());
        state.profile = { ...state.profile, isError: true, error: { status: 403 } };
        rerender(view());
        expect(screen.queryByLabelText('공개 닉네임')).toBeNull();
        expect(screen.getByText('프로필을 불러오지 못했어요.')).toBeInTheDocument();
    });
});
