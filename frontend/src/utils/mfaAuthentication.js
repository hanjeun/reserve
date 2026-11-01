import api from '../api/axios';
import { performPasskey } from './passkey';

const config = signal => ({ skipAuthRefresh: true, signal });

// 등록 환경의 표시 이름이며 기기 식별이나 패스키 저장 위치의 증명으로 사용하지 않아요.
function registrationName(credential) {
    try {
        const attachment = JSON.parse(credential).authenticatorAttachment;
        if (attachment === 'cross-platform') return '외부 패스키';
        if (attachment !== 'platform') return '패스키';
        const browser = globalThis.navigator;
        const ua = browser?.userAgent || '';
        const hints = browser?.userAgentData;
        const platform = hints?.platform || '';
        const mobile = hints?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
            || /Android|iOS/i.test(platform) || /Macintosh/i.test(ua) && browser.maxTouchPoints > 1;
        const pc = /Windows NT|Macintosh|X11|CrOS|Linux/i.test(ua) || /Windows|macOS|Linux|Chrome OS/i.test(platform);
        if (!mobile && !pc) return '패스키';
        const brands = Array.isArray(hints?.brands) ? hints.brands.map(value => value.brand) : [];
        const label = [
            ['Edge', /Edg(?:e|A|iOS)?\//i, 'Microsoft Edge'],
            ['Samsung Internet', /SamsungBrowser\//i, 'Samsung Internet'],
            ['Opera', /OPR\/|OPiOS\//i, 'Opera'],
            ['Firefox', /Firefox\/|FxiOS\//i, 'Firefox'],
            ['Chrome', /Chrome\/|CriOS\//i, 'Google Chrome'],
            ['Safari', /Safari\//i, 'Safari'],
        ].find(([, pattern, brand]) => pattern.test(ua) || brands.includes(brand))?.[0];
        const device = mobile ? '모바일' : 'PC';
        return label ? `${device} · ${label}` : `${device} 패스키`;
    } catch { return '패스키'; }
}

export async function authenticateWithPasskey(registration, signal) {
    const options = await api.post('/api/auth/mfa/passkey/options', { registration }, config(signal));
    signal?.throwIfAborted();
    const credential = await performPasskey(options, registration, signal);
    signal?.throwIfAborted();
    return registration
        ? api.post('/api/auth/mfa/passkey/confirm', { credential, name: registrationName(credential) }, config(signal))
        : api.post('/api/auth/mfa/verify', { kind: 'PASSKEY', proof: credential }, config(signal));
}
export async function finishMfaSession(signal, defer = false) {
    await api.post(defer ? '/api/auth/mfa/defer' : '/api/auth/mfa/finish', undefined, config(signal));
    signal?.throwIfAborted();
    return api.get('/api/member/me', config(signal));
}
