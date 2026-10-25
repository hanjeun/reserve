import { useEffect } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import ServiceAdmissionProvider from './ServiceAdmissionProvider';
import { advanceSession, currentSession } from '../../api/sessionScope';
import { completeServiceAdmission } from '../../api/serviceAdmissionGate';

vi.mock('../../services/serviceAdmissionService', () => ({ default: { status: vi.fn(async () => ({
    campaignId: 'service-entry', mode: 'CORE', state: 'NOT_JOINED', position: 0, expiresAt: 0,
    absoluteExpiresAt: 0, serverTime: Date.now(), heartbeatTimeoutSeconds: 90, pollAfterSeconds: 4, continuityId: null,
})) } }));
vi.mock('./ServiceAdmissionController', () => { throw new TypeError('Failed to fetch dynamically imported module: /assets/ServiceAdmissionController.js'); });
afterEach(() => vi.restoreAllMocks());

it('isolates a lazy controller load failure from the page form', async () => {
    advanceSession(); completeServiceAdmission(currentSession().epoch);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mounted = vi.fn();
    function Form() {
        useEffect(() => { mounted(); }, []);
        return <input aria-label="예약 내용" defaultValue="초안" />;
    }
    render(<MemoryRouter><ServiceAdmissionProvider><Form /></ServiceAdmissionProvider></MemoryRouter>);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '복구할 예약 내용' } });
    await screen.findByRole('alert');
    expect(input).toBe(screen.getByRole('textbox'));
    expect(input).toHaveValue('복구할 예약 내용');
    expect(mounted).toHaveBeenCalledOnce();
});
