import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import WaitingJoin from './WaitingJoin';
import waitingService from '../../services/waitingService';
import { clearRedirect, peekRedirect } from '../../utils/redirect';

const state = vi.hoisted(() => ({ revision: 1, loggedIn: true, termsAgreed: true, success: vi.fn() }));
vi.mock('../../store/useAuthStore', () => {
    const read = () => ({ sessionRevision: state.revision, isLoggedIn: state.loggedIn, user: { termsAgreed: state.termsAgreed } });
    const hook = selector => selector(read()); hook.getState = read; return { default: hook };
});
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { success: state.success } }) }));
vi.mock('../../services/waitingService', () => ({ default: { join: vi.fn(), getRetentionPolicy: vi.fn() } }));
vi.mock('../common', () => ({
    Button: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    FormField: ({ children, error }) => <div>{children}{error && <span role="alert">{error}</span>}</div>,
    FormInput: ({ value, onChange, disabled }) => <input aria-label="웨이팅 인원" type="number" value={value} disabled={disabled} onChange={e => onChange(e.target.valueAsNumber)} />,
    FormModal: ({ open, children, onSubmit, submitting, submitDisabled }) => open && <div role="dialog">{children}<button onClick={onSubmit} disabled={submitting || submitDisabled}>접수하기</button></div>,
}));
function Location() { const location = useLocation(); return <output aria-label="현재 접수 경로">{location.pathname}{location.search}{location.state?.from?.hash}</output>; }
function setup(mode = 'REMOTE', hash = '', storeValues = {}) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={[`/store/31${hash}`]}>
        <WaitingJoin store={{ id: 31, name: '가게', waitingIntakeMode: mode, ...storeValues }} /><Location /></MemoryRouter></QueryClientProvider>;
    const result = render(tree()); return { ...result, client, update: () => result.rerender(tree()) };
}
beforeEach(() => {
    state.revision = 1; state.loggedIn = true; state.termsAgreed = true; state.success.mockReset(); waitingService.join.mockReset();
    clearRedirect();
    waitingService.getRetentionPolicy.mockReset().mockResolvedValue({ intakeReady: true, noticePublishedAt: '2026-10-07T09:00:00Z', finishedRecordRetentionDays: 7 });
});
async function agreeToIntake() {
    const checkbox = screen.getByRole('checkbox', { name: '가게에 개인정보 제공 동의' });
    await waitFor(() => expect(checkbox).not.toBeDisabled());
    fireEvent.click(checkbox);
}

it('blocks duplicate submits and keeps the retry key until the party size changes', async () => {
    let fail;
    waitingService.join.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; })).mockRejectedValueOnce(new Error('다시 시도'));
    setup(); fireEvent.click(screen.getByRole('button', { name: '웨이팅 접수' }));
    await agreeToIntake();
    const submit = screen.getByRole('button', { name: '접수하기' }); fireEvent.click(submit); fireEvent.click(submit);
    expect(waitingService.join).toHaveBeenCalledTimes(1);
    const id = waitingService.join.mock.calls[0][1].clientRequestId;
    expect(waitingService.join.mock.calls[0][1]).toMatchObject({ privacyAgreed: true, privacyNoticePublishedAt: '2026-10-07T09:00:00Z' });
    await act(async () => fail(new Error('응답 실패')));
    fireEvent.click(submit); await screen.findByRole('alert');
    expect(waitingService.join.mock.calls[1][1].clientRequestId).toBe(id);
    fireEvent.change(screen.getByLabelText('웨이팅 인원'), { target: { value: '2' } });
    waitingService.join.mockResolvedValueOnce({ id: 1, storeId: 31 }); fireEvent.click(submit);
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('/my-reservations?tab=waiting'));
    expect(waitingService.join.mock.calls[2][1].clientRequestId).not.toBe(id);
});
it('onsite-only stores require a QR and preserve its fragment through the login handoff', () => {
    const view = setup('ONSITE');
    expect(screen.queryByRole('button', { name: '웨이팅 접수' })).toBeNull();
    expect(screen.getByRole('list', { name: '웨이팅 이용 순서' })).toHaveTextContent('현장 접수 QR');
    expect(screen.getByRole('link', { name: '내 웨이팅 확인' })).toHaveAttribute('href', '/my-reservations?tab=waiting');
    view.unmount();
    state.loggedIn = false; setup('ONSITE', '#waiting-token=rw1.j.test');
    fireEvent.click(screen.getByRole('button', { name: '로그인하고 접수' }));
    expect(screen.getByRole('status')).toHaveTextContent('/login#waiting-token=rw1.j.test');
    expect(peekRedirect()).toBe('/store/31#waiting-token=rw1.j.test');
    expect(waitingService.join).not.toHaveBeenCalled();
});

it('opens authenticated onsite intake directly and requires an explicit consent and submit', () => {
    setup('ONSITE', '#waiting-token=rw1.j.test');
    fireEvent.click(screen.getByRole('button', { name: '웨이팅 접수' }));
    expect(screen.getByRole('status', { name: '현재 접수 경로' })).toHaveTextContent('/store/31');
    expect(screen.getByRole('checkbox', { name: '가게에 개인정보 제공 동의' })).not.toBeChecked();
    expect(waitingService.join).not.toHaveBeenCalled();
});

it('keeps the onsite destination when an authenticated member still needs service agreement', () => {
    state.termsAgreed = false;
    setup('ONSITE', '#waiting-token=rw1.j.test');
    fireEvent.click(screen.getByRole('button', { name: '이용 동의하고 접수' }));
    expect(screen.getByRole('status')).toHaveTextContent('/signup/social');
    expect(peekRedirect()).toBe('/store/31#waiting-token=rw1.j.test');
    expect(waitingService.join).not.toHaveBeenCalled();
});

it('allows login before scanning the onsite QR without opening or submitting intake', () => {
    state.loggedIn = false; setup('ONSITE');
    fireEvent.click(screen.getByRole('button', { name: '로그인하기' }));
    expect(screen.getByRole('status')).toHaveTextContent('/login');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(waitingService.join).not.toHaveBeenCalled();
    expect(waitingService.getRetentionPolicy).not.toHaveBeenCalled();
});

it.each(['ONSITE', 'REMOTE', 'BOTH'])('keeps existing waiting guidance but offers no new intake when %s is paused', mode => {
    setup(mode, '#waiting-token=rw1.j.test', { waitingPaused: true, reservationEnabled: false });
    expect(screen.getByText(/웨이팅 접수가 잠시 중지돼 있어요/)).toHaveTextContent('기존 대기는 유지');
    expect(screen.queryByRole('button', { name: '웨이팅 접수' })).toBeNull();
    expect(screen.getByRole('link', { name: '내 웨이팅 확인' })).toHaveAttribute('href', '/my-reservations?tab=waiting');
    expect(waitingService.join).not.toHaveBeenCalled();
    expect(waitingService.getRetentionPolicy).not.toHaveBeenCalled();
});
it('an old account response cannot navigate or carry pending form state into the next account', async () => {
    let resolve;
    waitingService.join.mockImplementation(() => new Promise(done => { resolve = done; }));
    const view = setup(); fireEvent.click(screen.getByRole('button', { name: '웨이팅 접수' })); await agreeToIntake();
    fireEvent.click(screen.getByRole('button', { name: '접수하기' }));
    const signal = waitingService.join.mock.calls[0][2]; state.revision = 2; view.update();
    expect(signal.aborted).toBe(true);
    await act(async () => resolve({ id: 1 }));
    expect(state.success).not.toHaveBeenCalled(); expect(screen.getByRole('status')).toHaveTextContent('/store/31');
    fireEvent.click(screen.getByRole('button', { name: '웨이팅 접수' }));
    expect(screen.getByRole('checkbox', { name: '가게에 개인정보 제공 동의' })).not.toBeChecked();
    await agreeToIntake(); expect(screen.getByRole('button', { name: '접수하기' })).not.toBeDisabled();
});

it('never sends an entry before publication or without consent', async () => {
    waitingService.getRetentionPolicy.mockResolvedValue({ intakeReady: false, noticePublishedAt: null });
    setup(); fireEvent.click(screen.getByRole('button', { name: '웨이팅 접수' }));
    await screen.findByText('웨이팅 접수를 준비 중이에요. 잠시 후 다시 이용해주세요.');
    fireEvent.click(screen.getByRole('button', { name: '접수하기' }));
    expect(waitingService.join).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: '가게에 개인정보 제공 동의' })).toBeDisabled();
});

it('requires a fresh consent when a different notice version is loaded', async () => {
    const { client } = setup(); fireEvent.click(screen.getByRole('button', { name: '웨이팅 접수' }));
    await agreeToIntake();
    expect(screen.getByRole('button', { name: '접수하기' })).not.toBeDisabled();
    waitingService.getRetentionPolicy.mockResolvedValue({ intakeReady: true, noticePublishedAt: '2026-10-08T09:00:00Z', finishedRecordRetentionDays: 7 });
    // 공개 정책이 갱신되면 이전 버전의 동의로 접수하지 않는다.
    await act(async () => { await client.invalidateQueries({ queryKey: ['public', 'waitingRetentionPolicy'] }); });
    await waitFor(() => expect(screen.getByRole('checkbox', { name: '가게에 개인정보 제공 동의' })).not.toBeChecked());
    expect(waitingService.join).not.toHaveBeenCalled();
});

it('blocks intake when refreshing a cached notice fails', async () => {
    const { client } = setup(); fireEvent.click(screen.getByRole('button', { name: '웨이팅 접수' }));
    await agreeToIntake();
    waitingService.getRetentionPolicy.mockRejectedValue(new Error('정책 조회 실패'));
    await act(async () => { await client.invalidateQueries({ queryKey: ['public', 'waitingRetentionPolicy'] }); });
    await screen.findByText('접수 안내를 불러오지 못했어요.');
    expect(screen.getByRole('checkbox', { name: '가게에 개인정보 제공 동의' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '접수하기' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '접수하기' }));
    expect(waitingService.join).not.toHaveBeenCalled();
});
