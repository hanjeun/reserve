import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { AppearanceSection, NotificationSection, StoreDraftSection } from './AccountPreferences';
import useAuthStore from '../../store/useAuthStore';

const fixture = vi.hoisted(() => ({
    message: { success: vi.fn(), error: vi.fn() },
    memberService: { updateMember: vi.fn(), updateMarketingConsent: vi.fn() },
}));
vi.mock('../../hooks', () => ({ useMessage: () => ({ message: fixture.message }) }));
vi.mock('../../services', () => ({ memberService: fixture.memberService }));

const owner = { id: 7, role: 'BUSINESS', email: 'owner@example.test', emailNotificationEnabled: false, marketingAgreed: false };
const draftKey = 'reserve:store-draft:auto-save:member:7';
const seasonKey = 'reserve-winter-effect-off';

function AccountNotifications() {
    const user = useAuthStore(state => state.user);
    return <NotificationSection user={user} />;
}

beforeEach(() => {
    useAuthStore.getState().login(owner);
    localStorage.removeItem(draftKey);
    localStorage.removeItem(seasonKey);
});

it.each([
    ['예약 알림 메일', 'updateMember', { emailNotificationEnabled: true }, '예약 알림 메일을 켰어요.'],
    ['이메일 마케팅 수신', 'updateMarketingConsent', true, '이메일 마케팅 수신에 동의했어요.'],
])('confirms %s after saving and keeps the last saved value on failure', async (name, method, data, notice) => {
    let finish;
    const save = fixture.memberService[method];
    save.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<AccountNotifications />);
    const toggle = screen.getByRole('switch', { name });
    fireEvent.click(toggle);
    expect(save).toHaveBeenCalledExactlyOnceWith(data);
    expect(toggle).not.toBeChecked();
    expect(fixture.message.success).not.toHaveBeenCalled();

    await act(async () => { finish(); });
    expect(toggle).toBeChecked();
    expect(fixture.message.success).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ content: notice }));

    save.mockRejectedValueOnce(new Error('저장에 실패했어요.'));
    fireEvent.click(toggle);
    const { key } = fixture.message.success.mock.calls[0][0];
    await waitFor(() => expect(fixture.message.error).toHaveBeenCalledExactlyOnceWith({ key, content: '저장에 실패했어요.' }));
    expect(toggle).toBeChecked();
    expect(fixture.message.success).toHaveBeenCalledTimes(1);
});

it('acknowledges both browser preferences immediately and replaces the notice for the same switch', () => {
    render(<><AppearanceSection /><StoreDraftSection user={owner} /></>);
    const season = screen.getByRole('switch', { name: '계절 효과' });
    const draft = screen.getByRole('switch', { name: '가게 자동 임시저장' });

    fireEvent.click(season);
    fireEvent.click(draft);
    expect(season).not.toBeChecked();
    expect(draft).not.toBeChecked();
    expect(localStorage.getItem(seasonKey)).toBe('1');
    expect(localStorage.getItem(draftKey)).toBe('false');
    fireEvent.click(season);
    fireEvent.click(draft);
    expect(season).toBeChecked();
    expect(draft).toBeChecked();
    const notices = fixture.message.success.mock.calls.map(([notice]) => notice);
    expect(notices.map(notice => notice.content)).toEqual([
        '계절 효과를 껐어요.', '가게 자동 임시저장을 껐어요.', '계절 효과를 켰어요.', '가게 자동 임시저장을 켰어요.',
    ]);
    expect(notices[0].key).toBe(notices[2].key);
    expect(notices[1].key).toBe(notices[3].key);
    expect(notices[0].key).not.toBe(notices[1].key);
    expect(fixture.memberService.updateMember).not.toHaveBeenCalled();
    expect(fixture.memberService.updateMarketingConsent).not.toHaveBeenCalled();
});

it('does not update another account or confirm an earlier session’s save', async () => {
    let finish;
    fixture.memberService.updateMember.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    render(<AccountNotifications />);
    fireEvent.click(screen.getByRole('switch', { name: '예약 알림 메일' }));
    const other = { ...owner, id: 8, email: 'another@example.test' };
    act(() => useAuthStore.getState().login(other));
    await act(async () => { finish(); });
    expect(useAuthStore.getState().user).toEqual(other);
    expect(fixture.message.success).not.toHaveBeenCalled();
});
