import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import PublicProfileTab from './PublicProfileTab';

const state = vi.hoisted(() => ({ config: {}, profile: {}, save: vi.fn() }));
vi.mock('../../hooks/feedQueries', () => ({
    useFeedConfig: () => state.config,
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
vi.mock('../common/IconTool', () => ({ default: ({ label }) => <span>{label}</span> }));
vi.mock('../feed/FeedProfileFields', async () => {
    const { Form, Input } = await import('antd');
    return { default: ({ avatarField }) => <>
        {avatarField}
        <Form.Item name="nickname" label="공개 닉네임"><Input /></Form.Item>
        <Form.Item name="bio" label="소개"><Input /></Form.Item>
    </> };
});
vi.mock('./FeedProfileAvatarField', () => ({
    default: ({ pendingImage, onSelect, onChange }) => <>
        <button type="button" onClick={() => {
            onSelect(new File(['selected'], 'avatar.png', { type: 'image/png' }));
            onChange('CUSTOM');
        }}>사진 선택</button>
        {pendingImage && <img src={pendingImage} alt="선택한 사진" />}
    </>,
}));

const view = () => <MemoryRouter><PublicProfileTab /></MemoryRouter>;
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
    state.config = { data: { enabled: true }, refetch: vi.fn() };
    state.profile = { data: { nickname: '기존 이름', bio: '', avatarSource: 'ACCOUNT' }, refetch: vi.fn() };
    vi.stubGlobal('URL', class extends URL {
        static createObjectURL() { return 'blob:selected-avatar'; }
        static revokeObjectURL() {}
    });
});

describe('public profile background read preservation', () => {
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

    it('retains an editor initialized without a public profile when a background config read fails', () => {
        state.profile.data = null;
        const { rerender } = render(view());
        fireEvent.change(screen.getByLabelText('공개 닉네임'), { target: { value: '첫 닉네임' } });
        state.config = { ...state.config, isError: true, error: { status: 502 } };
        rerender(view());
        expect(screen.getByLabelText('공개 닉네임')).toHaveValue('첫 닉네임');
    });

    it('hides cached profile data after access is denied', () => {
        const { rerender } = render(view());
        state.profile = { ...state.profile, isError: true, error: { status: 403 } };
        rerender(view());
        expect(screen.queryByLabelText('공개 닉네임')).toBeNull();
        expect(screen.getByText('공개 프로필을 불러오지 못했어요.')).toBeInTheDocument();
    });
});
