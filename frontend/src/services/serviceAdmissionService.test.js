import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const request = vi.hoisted(() => vi.fn());
vi.mock('../api/axios', () => ({ default: { get: request } }));
import { prepareCoreWork } from './serviceAdmissionService';
import { advanceSession, currentSession } from '../api/sessionScope';
import { subscribeServiceAdmission, cancelServiceAdmission } from '../api/serviceAdmissionGate';

const status = (state = 'BYPASS', mode = 'OFF') => ({ campaignId: 'service-entry', mode, state, position: state === 'WAITING' ? 7 : 0,
    expiresAt: state === 'ADMITTED' ? Date.now() + 900000 : 0, absoluteExpiresAt: state === 'ADMITTED' ? Date.now() + 7200000 : 0,
    serverTime: Date.now(), pollAfterSeconds: 4, heartbeatTimeoutSeconds: 90,
    continuityId: ['WAITING', 'ADMITTED'].includes(state) ? 'a'.repeat(64) : null });
const config = () => ({ method: 'post', url: '/api/reservations', epoch: currentSession().epoch, signal: currentSession().signal });
let stop;
beforeEach(() => { advanceSession(); request.mockReset(); });
afterEach(() => { stop?.(); stop = null; cancelServiceAdmission(currentSession().epoch); });

describe('common admission before reservation campaign', () => {
    it.each([['BYPASS', 'OFF'], ['ADMITTED', 'CORE'], ['ADMITTED', 'EMERGENCY']])('continues only after server confirms %s / %s', async (state, mode) => {
        request.mockResolvedValue(status(state, mode));
        expect(await prepareCoreWork(config())).toBe(true);
        expect(request).toHaveBeenCalledWith('/api/service-admission', expect.objectContaining({ _sessionEpoch: currentSession().epoch }));
    });
    it.each(['NOT_JOINED', 'WAITING', 'EXPIRED', 'FULL'])('opens common entry and does not submit anything for %s', async state => {
        const listener = vi.fn();
        stop = subscribeServiceAdmission(currentSession().epoch, listener);
        request.mockResolvedValue(status(state, 'CORE'));
        expect(await prepareCoreWork(config())).toBe(false);
        expect(listener).toHaveBeenCalledWith({ code: 'SERVICE_ADMISSION_REQUIRED', mode: 'CORE' });
        expect(request).toHaveBeenCalledOnce();
    });
    it('does not publish a late result under another account', async () => {
        request.mockImplementation(async () => { advanceSession(); return status('WAITING', 'CORE'); });
        await expect(prepareCoreWork(config())).rejects.toMatchObject({ isStaleSession: true });
    });
    it('allows a legacy optional-status route while final server authorization remains authoritative', async () => {
        request.mockRejectedValue(Object.assign(new Error('legacy endpoint'), { status: 404 }));
        expect(await prepareCoreWork(config())).toBe(true);
    });
    it('surfaces unavailable Redis instead of treating it as mode OFF', async () => {
        const listener = vi.fn();
        stop = subscribeServiceAdmission(currentSession().epoch, listener);
        request.mockRejectedValue(Object.assign(new Error('temporarily unavailable'), { status: 503, data: { code: 'SERVICE_ADMISSION_UNAVAILABLE', mode: null } }));
        await expect(prepareCoreWork(config())).rejects.toThrow('temporarily unavailable');
        expect(listener).toHaveBeenCalledWith({ code: 'SERVICE_ADMISSION_UNAVAILABLE', mode: null });
    });
    it('rejects malformed presentation data', async () => {
        request.mockResolvedValue({ mode: 'OFF', state: 'ADMITTED' });
        await expect(prepareCoreWork(config())).rejects.toThrow('서비스 입장 상태');
    });
});
