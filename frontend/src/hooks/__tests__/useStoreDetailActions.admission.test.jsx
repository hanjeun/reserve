import React from 'react';
import dayjs from 'dayjs';
import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), recover: vi.fn(), prepare: vi.fn(), getPendingAttempt: vi.fn(),
    enter: vi.fn(), restoreEntry: vi.fn(), complete: vi.fn(), navigate: vi.fn(), requestAttempt: vi.fn(), clearRequest: vi.fn(),
    update: vi.fn(), getReservation: vi.fn() }));
vi.mock('react-router-dom', async original => ({ ...(await original()), useNavigate: () => mocks.navigate }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../../services/reservationService', () => ({ default: { createReservation: mocks.create, recoverReservation: mocks.recover,
    getMyCompletedForStore: () => Promise.resolve(null), updateReservation: mocks.update, getReservation: mocks.getReservation } }));
vi.mock('../../services/serviceAdmissionService', () => ({ prepareCoreWork: mocks.prepare }));
vi.mock('../useReservationAdmission', () => ({ default: () => ({ getPendingAttempt: mocks.getPendingAttempt, enter: mocks.enter,
    restoreEntry: mocks.restoreEntry, complete: mocks.complete, modalProps: {} }) }));
vi.mock('../../utils/reservationRequest', () => ({ reservationRequestAttempt: mocks.requestAttempt, completeReservationRequest: mocks.clearRequest }));
vi.mock('../../services/adService', () => ({ default: { recordConversion: vi.fn() } }));
vi.mock('../../utils/adAttribution', () => ({ consumeAdClickAttribution: () => null }));
import useStoreDetailActions from '../useStoreDetailActions';
import { advanceSession, currentSession } from '../../api/sessionScope';

const attempt = { ticket: '22222222-2222-4222-8222-222222222222', requestId: '11111111-1111-4111-8111-111111111111', expiresAt: Date.now() + 180000 };
const NORMAL_REQUEST = '33333333-3333-4333-8333-333333333333';
const values = () => ({ reservationDate: dayjs().add(2, 'day'), reservationTime: '12:00', guestCount: 1 });
let message;
beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPendingAttempt.mockResolvedValue(null); mocks.enter.mockResolvedValue(null);
    mocks.restoreEntry.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 20, depositAmount: 0 }); mocks.recover.mockResolvedValue(null);
    mocks.prepare.mockResolvedValue(true); mocks.requestAttempt.mockResolvedValue({ requestId: NORMAL_REQUEST, reused: false });
    message = { warning: vi.fn(), error: vi.fn(), info: vi.fn(), success: vi.fn() };
});
function hook(initialProps = {}, path = '/store/10') {
    const wrapper = ({ children }) => <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>;
    return renderHook(props => useStoreDetailActions({ id: '10', store: { id: 10 }, isLoggedIn: true, user: { id: 1, role: 'USER' },
        form: { setFields: vi.fn(), setFieldsValue: vi.fn() }, pay: vi.fn(), message, ...props }), { wrapper, initialProps });
}

it('restores only the selected slot notice after returning without submitting or opening a queue', async () => {
    const selected = values();
    mocks.restoreEntry.mockResolvedValue(attempt);
    const view = hook(selected);
    await waitFor(() => expect(view.result.current.reservationEntry).not.toBeNull());
    expect(mocks.restoreEntry).toHaveBeenCalledWith({ storeId: 10, date: selected.reservationDate.format('YYYY-MM-DD'), time: '12:00' }, expect.any(AbortSignal));
    expect(view.result.current.reservationEntry).toMatchObject({ expiresAt: attempt.expiresAt });
    expect(mocks.enter).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
});

it('ignores an older admitted restore response after a newer visibility check says the grant expired', async () => {
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    let resolveOld;
    mocks.restoreEntry.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; })).mockResolvedValue(null);
    const view = hook(values());
    try {
        await waitFor(() => expect(resolveOld).toBeTypeOf('function'));
        const oldSignal = mocks.restoreEntry.mock.calls[0][1];
        visibility.mockReturnValue('hidden'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        expect(oldSignal.aborted).toBe(true);
        visibility.mockReturnValue('visible'); act(() => document.dispatchEvent(new Event('visibilitychange')));
        await waitFor(() => expect(mocks.restoreEntry).toHaveBeenCalledTimes(2));
        await act(async () => { resolveOld(attempt); });
        expect(view.result.current.reservationEntry).toBeNull();
        expect(mocks.create).not.toHaveBeenCalled();
        expect(mocks.enter).not.toHaveBeenCalled();
    } finally { view.unmount(); visibility.mockRestore(); }
});

it('updates an existing reservation without admission, a new request key, or a countdown notice', async () => {
    const selected = values();
    mocks.getReservation.mockResolvedValue({ id: 20, storeId: 10, status: 'CONFIRMED', depositPaid: false,
        reservationDate: selected.reservationDate.format('YYYY-MM-DD'), reservationTime: '12:00:00', guestCount: 1 });
    mocks.update.mockResolvedValue({ id: 20 });
    const view = hook(selected, '/store/10?edit=20');
    await waitFor(() => expect(view.result.current.editingReservation?.id).toBe(20));
    await act(async () => { await view.result.current.onFinish(selected); });
    expect(mocks.update).toHaveBeenCalledWith(20, expect.objectContaining({ reservationTime: '12:00' }));
    expect(mocks.restoreEntry).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.enter).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.requestAttempt).not.toHaveBeenCalled();
    expect(view.result.current.reservationEntry).toBeNull();
});
it('does not book after queue cancellation or a failed campaign check', async () => {
    mocks.enter.mockResolvedValue(false);
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.getPendingAttempt.mockRejectedValue(new Error('대기 설정을 확인하지 못했어요.'));
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.create).not.toHaveBeenCalled(); expect(message.error).toHaveBeenCalled();
});
it('recovers a committed result with the original key before asking Redis for admission', async () => {
    mocks.getPendingAttempt.mockResolvedValue(attempt);
    mocks.recover.mockResolvedValue({ id: 20, depositAmount: 0 });
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.recover).toHaveBeenCalledWith(expect.objectContaining({ admissionTicket: attempt.ticket, requestId: attempt.requestId }), { signal: expect.any(AbortSignal) });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.enter).not.toHaveBeenCalled(); expect(mocks.complete).toHaveBeenCalledWith(attempt);
    expect(mocks.navigate).toHaveBeenCalledWith('/my-reservations');
});
it('does not replace a conflicting committed request with a new key', async () => {
    mocks.getPendingAttempt.mockResolvedValue(attempt);
    mocks.recover.mockRejectedValue(Object.assign(new Error('이미 사용한 요청 번호예요.'), { status: 409 }));
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.enter).not.toHaveBeenCalled(); expect(mocks.requestAttempt).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
});
it('submits once with the admitted ticket while duplicate clicks are pending', async () => {
    let continueAdmission;
    mocks.enter.mockImplementation(() => new Promise(resolve => { continueAdmission = resolve; }));
    const { result } = hook();
    let first;
    await act(async () => { first = result.current.onFinish(values()); });
    await waitFor(() => expect(continueAdmission).toBeTypeOf('function'));
    await act(async () => { await result.current.onFinish(values()); });
    await act(async () => { continueAdmission(attempt); await first; });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.requestAttempt).toHaveBeenCalledOnce();
    expect(result.current.reservationEntry).toMatchObject({ expiresAt: attempt.expiresAt });
    expect(message.info).not.toHaveBeenCalled();
    mocks.getPendingAttempt.mockResolvedValue(attempt);
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(result.current.reservationEntry).toBeNull();
});

it('expires the returned grant locally without another API request or reservation write', async () => {
    vi.useFakeTimers();
    const grant = { ...attempt, expiresAt: Date.now() + 2000 };
    mocks.enter.mockResolvedValue(grant);
    const view = hook();
    try {
        await act(async () => { await view.result.current.onFinish(values()); });
        expect(view.result.current.reservationEntry.expiresAt).toBe(grant.expiresAt);
        act(() => { vi.advanceTimersByTime(2000); });
        expect(view.result.current.reservationEntry).toBeNull();
        expect(mocks.enter).toHaveBeenCalledOnce();
        expect(mocks.getPendingAttempt).toHaveBeenCalledOnce();
        expect(mocks.create).not.toHaveBeenCalled();
    } finally { view.unmount(); vi.useRealTimers(); }
});

it('clears the previous grant when waiting is cancelled and hides it after logout or leaving the store', async () => {
    mocks.enter.mockResolvedValue(attempt);
    const view = hook();
    await act(async () => { await view.result.current.onFinish(values()); });
    expect(view.result.current.reservationEntry).not.toBeNull();
    mocks.enter.mockResolvedValueOnce(false);
    await act(async () => { await view.result.current.onFinish(values()); });
    expect(view.result.current.reservationEntry).toBeNull();
    await act(async () => { await view.result.current.onFinish(values()); });
    view.rerender({ isLoggedIn: false, user: null });
    expect(view.result.current.reservationEntry).toBeNull();
    view.rerender({ id: '11' });
    expect(view.result.current.reservationEntry).toBeNull();
    view.unmount();
    expect(mocks.create).not.toHaveBeenCalled();
});

it('checks common capacity before campaign entry and preserves the form when common admission is pending', async () => {
    mocks.prepare.mockResolvedValue(false);
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.prepare).toHaveBeenCalledWith({ method: 'post', url: '/api/reservations',
        epoch: currentSession().epoch, signal: currentSession().signal });
    expect(mocks.enter).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.recover).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled(); expect(result.current.reservationSubmitting).toBe(false);
    mocks.prepare.mockResolvedValue(true); mocks.enter.mockResolvedValue(attempt);
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.enter).toHaveBeenCalledOnce();
    expect(mocks.prepare.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.enter.mock.invocationCallOrder[0]);
    expect(mocks.create).not.toHaveBeenCalled();
});

it('recovers a reused normal key without common admission or any new reservation write', async () => {
    mocks.requestAttempt.mockResolvedValue({ requestId: NORMAL_REQUEST, reused: true });
    mocks.recover.mockResolvedValue({ id: 21, depositAmount: 0 });
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.recover).toHaveBeenCalledWith(expect.objectContaining({ requestId: NORMAL_REQUEST }), { signal: expect.any(AbortSignal) });
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.enter).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.clearRequest).toHaveBeenCalledWith('1:USER:10');
    expect(mocks.navigate).toHaveBeenCalledWith('/my-reservations');
});

it('uses the existing normal key after a missing result and common admission confirmation', async () => {
    mocks.requestAttempt.mockResolvedValue({ requestId: NORMAL_REQUEST, reused: true });
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.recover).toHaveBeenCalledOnce();
    expect(mocks.recover.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]);
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.enter.mock.invocationCallOrder[0]);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ requestId: NORMAL_REQUEST }));
    expect(mocks.requestAttempt).toHaveBeenCalledOnce();
});

it('skips recovery for a new normal key and does not continue if the common preflight fails', async () => {
    mocks.prepare.mockRejectedValueOnce(new Error('입장 상태를 확인하지 못했어요.'));
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.recover).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enter).not.toHaveBeenCalled(); expect(message.error).toHaveBeenCalled();
});

it('creates a fresh normal reservation only after common admission without a result lookup', async () => {
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.recover).not.toHaveBeenCalled(); expect(mocks.requestAttempt).toHaveBeenCalledOnce();
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ requestId: NORMAL_REQUEST }));
    expect(mocks.navigate).toHaveBeenCalledWith('/my-reservations');
});

it('keeps a campaign key after missing recovery and waits for common capacity before the original POST', async () => {
    mocks.getPendingAttempt.mockResolvedValue(attempt); mocks.prepare.mockResolvedValueOnce(false);
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.recover).toHaveBeenCalledOnce(); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.enter).not.toHaveBeenCalled(); expect(mocks.requestAttempt).not.toHaveBeenCalled();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ requestId: attempt.requestId, admissionTicket: attempt.ticket }));
    expect(mocks.enter).not.toHaveBeenCalled();
});

it('rechecks a campaign admission 409 only after common admission and returns a new grant to the form', async () => {
    mocks.getPendingAttempt.mockResolvedValue(attempt);
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('입장권을 다시 확인해주세요.'), { status: 409 }));
    mocks.enter.mockResolvedValue({ ...attempt, expiresAt: attempt.expiresAt + 1000 });
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.recover.mock.invocationCallOrder[0]).toBeLessThan(mocks.prepare.mock.invocationCallOrder[0]);
    expect(mocks.prepare.mock.invocationCallOrder[0]).toBeLessThan(mocks.create.mock.invocationCallOrder[0]);
    expect(mocks.create.mock.invocationCallOrder[0]).toBeLessThan(mocks.enter.mock.invocationCallOrder[0]);
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.complete).not.toHaveBeenCalled();
    expect(mocks.requestAttempt).toHaveBeenCalledWith('1:USER:10', expect.objectContaining({ admissionTicket: attempt.ticket }), attempt.requestId);
    expect(result.current.reservationEntry).not.toBeNull();
});

it('never re-enters or changes a campaign key after a reservation POST fingerprint conflict', async () => {
    mocks.getPendingAttempt.mockResolvedValue(attempt);
    mocks.create.mockRejectedValue(Object.assign(new Error('이미 사용한 요청 번호예요.'), { status: 409 }));
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.create).toHaveBeenCalledOnce(); expect(mocks.enter).not.toHaveBeenCalled();
    expect(mocks.requestAttempt).toHaveBeenCalledWith('1:USER:10', expect.objectContaining({ requestId: attempt.requestId }), attempt.requestId);
    expect(mocks.complete).not.toHaveBeenCalled();
});

it('preserves the original campaign key if admission is no longer configured after a 409', async () => {
    mocks.getPendingAttempt.mockResolvedValue(attempt);
    mocks.create.mockRejectedValueOnce(Object.assign(new Error('입장권을 다시 확인해주세요.'), { status: 409 }))
        .mockResolvedValueOnce({ id: 23, depositAmount: 0 });
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.create.mock.calls.map(([data]) => data.requestId)).toEqual([attempt.requestId, attempt.requestId]);
    expect(mocks.requestAttempt).toHaveBeenCalledWith('1:USER:10', expect.objectContaining({ requestId: attempt.requestId }), attempt.requestId);
    expect(mocks.complete).toHaveBeenCalledWith(attempt);
});

it('recovers the committed campaign key after a lost response even if the campaign is later disabled', async () => {
    mocks.getPendingAttempt.mockResolvedValueOnce(attempt).mockResolvedValue(null);
    mocks.recover.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 23, depositAmount: 0 });
    mocks.create.mockRejectedValueOnce(new Error('응답을 받지 못했어요.'));
    mocks.requestAttempt.mockImplementation(async (_scope, _payload, submitted) => ({ requestId: submitted ?? attempt.requestId, reused: submitted == null }));
    const { result } = hook();
    const selected = values();
    await act(async () => { await result.current.onFinish(selected); });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.requestAttempt).toHaveBeenCalledWith('1:USER:10', expect.any(Object), attempt.requestId);
    await act(async () => { await result.current.onFinish(selected); });
    expect(mocks.recover.mock.calls.map(([data]) => data.requestId)).toEqual([attempt.requestId, attempt.requestId]);
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.enter).not.toHaveBeenCalled();
    expect(mocks.complete).toHaveBeenCalledWith({ requestId: attempt.requestId });
    expect(mocks.navigate).toHaveBeenCalledWith('/my-reservations');
});

it.each([401, 409, 503])('does not write or enter a queue after a failed read-only recovery (%s)', async status => {
    mocks.requestAttempt.mockResolvedValue({ requestId: NORMAL_REQUEST, reused: true });
    mocks.recover.mockRejectedValue(Object.assign(new Error('이전 요청을 확인하지 못했어요.'), { status }));
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.enter).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
});

it('discards a recovered result from a previous account without clearing keys or navigating', async () => {
    mocks.getPendingAttempt.mockResolvedValue(attempt);
    mocks.recover.mockImplementation(async () => { advanceSession(); return { id: 20, depositAmount: 0 }; });
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled(); expect(mocks.clearRequest).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
});

it('does not submit after an account switch while common capacity is being checked', async () => {
    mocks.prepare.mockImplementation(async () => { advanceSession(); return true; });
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.enter).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
});
it('cannot submit the previous account form after an account switch during admission', async () => {
    mocks.enter.mockImplementation(async () => { advanceSession(); return attempt; });
    const { result } = hook();
    await act(async () => { await result.current.onFinish(values()); });
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.complete).not.toHaveBeenCalled();
});
