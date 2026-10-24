import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ServiceAdmissionProvider from './ServiceAdmissionProvider';
import service from '../../services/serviceAdmissionService';
import { advanceSession, currentSession } from '../../api/sessionScope';
import { completeServiceAdmission, observeServiceAdmission } from '../../api/serviceAdmissionGate';

const mocks = vi.hoisted(() => ({ loaded: vi.fn(), mounted: vi.fn(), observed: vi.fn() }));
vi.mock('../../services/serviceAdmissionService', () => ({ default: { status: vi.fn() } }));
vi.mock('./ServiceAdmissionController', async () => {
    mocks.loaded();
    const { useEffect, useState } = await import('react');
    const { currentSession } = await import('../../api/sessionScope');
    const { subscribeServiceAdmission } = await import('../../api/serviceAdmissionGate');
    return { default: function Controller() {
        const [open, setOpen] = useState(false);
        useEffect(() => {
            mocks.mounted();
            return subscribeServiceAdmission(currentSession().epoch, reason => { mocks.observed(reason); setOpen(true); });
        }, []);
        return <><span data-testid="controller-ready" />{open && <section role="dialog" aria-label="서비스 입장 대기">
            <button type="button" onClick={() => setOpen(false)}>닫기</button>
        </section>}</>;
    } };
});

const status = (mode = 'OFF', changes = {}) => ({ campaignId: 'service-entry', mode,
    state: mode === 'OFF' ? 'BYPASS' : 'NOT_JOINED', position: 0, expiresAt: 0, absoluteExpiresAt: 0,
    serverTime: Date.now(), pollAfterSeconds: 4, heartbeatTimeoutSeconds: 90, continuityId: null, ...changes });
const views = [];
const renderProvider = child => {
    const view = render(<MemoryRouter><ServiceAdmissionProvider>{child || <input aria-label="예약 내용" defaultValue="작성 중" />}</ServiceAdmissionProvider></MemoryRouter>);
    views.push(view); return view;
};
const gate = () => act(() => observeServiceAdmission({ method: 'post', url: '/api/reservations', _sessionEpoch: currentSession().epoch }, { code: 'SERVICE_ADMISSION_REQUIRED' }));
const flush = () => act(async () => { await Promise.resolve(); });

describe('lightweight service admission shell', () => {
    beforeEach(() => {
        advanceSession(); completeServiceAdmission(currentSession().epoch);
        vi.clearAllMocks(); service.status.mockReset().mockResolvedValue(status());
    });
    afterEach(() => { views.splice(0).forEach(view => view.unmount()); vi.restoreAllMocks(); });

    it('keeps OFF mode unloaded and the child page available after the bootstrap status check', async () => {
        renderProvider(); await flush();
        expect(service.status).toHaveBeenCalledWith(expect.any(AbortSignal));
        expect(mocks.loaded).not.toHaveBeenCalled(); expect(mocks.mounted).not.toHaveBeenCalled();
        expect(screen.queryByTestId('controller-ready')).toBeNull();
        expect(screen.getByRole('textbox')).toHaveValue('작성 중');
    });

    it('replays a pending gate after lazy loading while retaining the exact child form and controller mount', async () => {
        const mounted = vi.fn();
        function Form() {
            useEffect(() => { mounted(); }, []);
            return <input aria-label="예약 내용" defaultValue="초안" />;
        }
        renderProvider(<Form />); await flush();
        const input = screen.getByRole('textbox');
        fireEvent.change(input, { target: { value: '오래 작성한 예약 내용' } });
        gate();
        expect(input).toBe(screen.getByRole('textbox'));
        await screen.findByRole('dialog', { name: '서비스 입장 대기' });
        expect(mocks.observed).toHaveBeenCalledWith({ code: 'SERVICE_ADMISSION_REQUIRED' });
        expect(input).toBe(screen.getByRole('textbox'));
        expect(input).toHaveValue('오래 작성한 예약 내용');
        expect(mounted).toHaveBeenCalledOnce(); expect(mocks.mounted).toHaveBeenCalledOnce();
        fireEvent.click(screen.getByRole('button', { name: '닫기' }));
        expect(screen.queryByRole('dialog')).toBeNull();
        gate();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
        expect(mocks.mounted).toHaveBeenCalledOnce();
        expect(mounted).toHaveBeenCalledOnce();
    });

    it.each(['CORE', 'EMERGENCY'])('loads the runtime for a validated %s response', async mode => {
        service.status.mockResolvedValue(status(mode));
        renderProvider();
        await waitFor(() => expect(mocks.mounted).toHaveBeenCalledOnce());
        expect(screen.getByRole('textbox')).toHaveValue('작성 중');
    });

    it('keeps bootstrap failures and malformed status quiet until a real protected gate arrives', async () => {
        service.status.mockRejectedValueOnce(new Error('offline'));
        const first = renderProvider(); await flush();
        expect(mocks.mounted).not.toHaveBeenCalled(); first.unmount();
        service.status.mockResolvedValueOnce(status('EMERGENCY', { heartbeatTimeoutSeconds: 0 }));
        renderProvider(); await flush();
        expect(mocks.mounted).not.toHaveBeenCalled(); expect(screen.queryByRole('dialog')).toBeNull();
        gate(); await screen.findByRole('dialog');
        expect(screen.getByRole('textbox')).toHaveValue('작성 중');
    });

    it('ignores late responses and gate callbacks belonging to an earlier session', async () => {
        let resolveStatus;
        service.status.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
        renderProvider();
        const signal = service.status.mock.calls[0][0];
        act(() => advanceSession());
        expect(signal.aborted).toBe(true);
        await act(async () => resolveStatus(status('CORE')));
        gate(); await flush();
        expect(mocks.mounted).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(screen.getByRole('textbox')).toHaveValue('작성 중');
    });

    it('aborts bootstrap and removes its gate subscription when unmounted', async () => {
        let resolveStatus;
        service.status.mockImplementationOnce(() => new Promise(resolve => { resolveStatus = resolve; }));
        const view = renderProvider();
        const signal = service.status.mock.calls[0][0];
        view.unmount(); expect(signal.aborted).toBe(true);
        gate(); await act(async () => resolveStatus(status('EMERGENCY')));
        expect(mocks.mounted).not.toHaveBeenCalled();
    });
});
