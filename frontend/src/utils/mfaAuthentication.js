import api from '../api/axios';
import { performPasskey } from './passkey';

const config = signal => ({ skipAuthRefresh: true, signal });
export async function authenticateWithPasskey(registration, signal) {
    const options = await api.post('/api/auth/mfa/passkey/options', { registration }, config(signal));
    signal?.throwIfAborted();
    const credential = await performPasskey(options, registration, signal);
    signal?.throwIfAborted();
    return registration
        ? api.post('/api/auth/mfa/passkey/confirm', { credential, name: '패스키' }, config(signal))
        : api.post('/api/auth/mfa/verify', { kind: 'PASSKEY', proof: credential }, config(signal));
}
export async function finishMfaSession(signal, defer = false) {
    await api.post(defer ? '/api/auth/mfa/defer' : '/api/auth/mfa/finish', undefined, config(signal));
    signal?.throwIfAborted();
    return api.get('/api/member/me', config(signal));
}
