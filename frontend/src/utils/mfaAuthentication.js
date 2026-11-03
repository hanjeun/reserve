import api from '../api/axios';
import { performPasskey } from './passkey';
import { assertCurrentSession, currentSession } from '../api/sessionScope';

const config = signal => ({ skipAuthRefresh: true, signal });

// 등록 환경의 표시 이름이며 기기 식별이나 패스키 저장 위치의 증명으로 사용하지 않아요.
function registrationName(credential) {
    try {
        const attachment = JSON.parse(credential).authenticatorAttachment;
        if (!['platform', 'cross-platform'].includes(attachment)) return '패스키';
        const browser = globalThis.navigator;
        const ua = browser?.userAgent || '';
        const hints = browser?.userAgentData;
        const platform = hints?.platform || '';
        const mobile = hints?.mobile === true || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
            || /Android|iOS/i.test(platform) || /Macintosh/i.test(ua) && browser.maxTouchPoints > 1;
        const pc = /Windows NT|Macintosh|X11|CrOS|Linux/i.test(ua) || /Windows|macOS|Linux|Chrome OS/i.test(platform);
        if (attachment === 'cross-platform' && !mobile) return '다른 기기 패스키';
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
        const environment = label ? `${device} · ${label}` : `${device} 패스키`;
        return attachment === 'cross-platform' ? `${environment}에서 등록` : environment;
    } catch { return '패스키'; }
}

const ambiguousVerification = failure => !failure?.isSessionExpired && !failure?.isStaleSession
    && !['AbortError', 'NotAllowedError', 'CanceledError'].includes(failure?.name)
    && (failure?.status == null || failure.status === 408 || failure.status >= 500 && failure.status <= 599);

async function verificationStatus(state, signal) {
    assertCurrentSession(state.epoch);
    signal?.throwIfAborted();
    const result = await api.post('/api/auth/mfa/status', undefined, config(signal));
    assertCurrentSession(state.epoch);
    signal?.throwIfAborted();
    if (!state.reference || result?.completionId !== state.reference)
        throw new Error('인증 요청이 바뀌었어요. 인증을 다시 시작해주세요.');
    state.verificationPending = false;
    return result.verified === true ? result : null;
}

export async function verifyMfaProof(kind, proof, signal, state = {}) {
    state.epoch ??= currentSession().epoch;
    assertCurrentSession(state.epoch);
    signal?.throwIfAborted();
    if (state.verificationPending) {
        const verified = await verificationStatus(state, signal);
        if (verified) return verified;
    }
    const recoverable = /^[a-f0-9]{64}$/.test(state.reference || '');
    state.verificationPending = recoverable;
    try {
        const result = await api.post('/api/auth/mfa/verify', { kind, proof }, config(signal));
        assertCurrentSession(state.epoch);
        signal?.throwIfAborted();
        state.verificationPending = false;
        return result;
    } catch (failure) {
        assertCurrentSession(state.epoch);
        signal?.throwIfAborted();
        if (!ambiguousVerification(failure)) state.verificationPending = false;
        else if (recoverable) {
            // 일회용 증명을 다시 보내지 않고 같은 요청의 서버 확인만 복원한다.
            try {
                const verified = await verificationStatus(state, signal);
                if (verified) return verified;
            } catch { assertCurrentSession(state.epoch); signal?.throwIfAborted(); }
        }
        throw failure;
    }
}

async function enrollmentStatus(state, signal) {
    const result = await verificationStatus(state, signal);
    state.enrollmentPending = false;
    return result?.purpose === 'LOGIN' && result.enrollmentRequired === false ? { codes: [], recovered: true } : null;
}

export async function confirmMfaEnrollment(kind, body, signal, state = {}) {
    if (!['totp', 'passkey'].includes(kind)) throw new Error('인증 수단을 확인해주세요.');
    state.epoch ??= currentSession().epoch;
    assertCurrentSession(state.epoch);
    signal?.throwIfAborted();
    if (state.enrollmentPending) {
        const restored = await enrollmentStatus(state, signal);
        if (restored) return restored;
    }
    const recoverable = /^[a-f0-9]{64}$/.test(state.reference || '');
    state.enrollmentPending = recoverable;
    try {
        const result = await api.post('/api/auth/mfa/' + kind + '/confirm', body, config(signal));
        assertCurrentSession(state.epoch);
        signal?.throwIfAborted();
        state.enrollmentPending = false;
        return result;
    } catch (failure) {
        assertCurrentSession(state.epoch);
        signal?.throwIfAborted();
        if (!ambiguousVerification(failure)) state.enrollmentPending = false;
        else if (recoverable) {
            try {
                const restored = await enrollmentStatus(state, signal);
                if (restored) return restored;
            } catch { assertCurrentSession(state.epoch); signal?.throwIfAborted(); }
        }
        throw failure;
    }
}

export async function authenticateWithPasskey(registration, signal, state = {}) {
    const session = currentSession();
    const activeSignal = signal ? AbortSignal.any([signal, session.signal]) : session.signal;
    state.epoch ??= session.epoch;
    assertCurrentSession(state.epoch);
    try {
        if (registration && state.enrollmentPending) {
            const restored = await enrollmentStatus(state, activeSignal);
            if (restored) return restored;
        }
        if (!registration && state.verificationPending) {
            const verified = await verificationStatus(state, activeSignal);
            if (verified) return verified;
        }
        const options = await api.post('/api/auth/mfa/passkey/options', { registration }, config(activeSignal));
        assertCurrentSession(session.epoch);
        activeSignal.throwIfAborted();
        const credential = await performPasskey(options, registration, activeSignal);
        assertCurrentSession(session.epoch);
        activeSignal.throwIfAborted();
        return registration
            ? await confirmMfaEnrollment('passkey', { credential, name: registrationName(credential) }, activeSignal, state)
            : await verifyMfaProof('PASSKEY', credential, activeSignal, state);
    } catch (failure) {
        assertCurrentSession(session.epoch);
        throw failure;
    }
}
export async function finishMfaSession(signal, defer = false, completion = {}) {
    const session = currentSession();
    completion.epoch ??= session.epoch;
    assertCurrentSession(completion.epoch);
    signal?.throwIfAborted();
    if (!completion.issued) {
        try {
            const result = await api.post(defer ? '/api/auth/mfa/defer' : '/api/auth/mfa/finish',
                !defer && (completion.reference || completion.rememberBrowser != null)
                    ? { ...(completion.reference ? { completionId: completion.reference } : {}),
                        ...(completion.rememberBrowser != null ? { rememberBrowser: completion.rememberBrowser } : {}) } : undefined, config(signal));
            completion.browser = result?.browser;
        } catch (failure) {
            assertCurrentSession(completion.epoch);
            signal?.throwIfAborted();
            if (defer || !completion.reference || failure?.isSessionExpired || failure?.isStaleSession) throw failure;
            // 응답이 끊겨도 같은 요청이 발급한 현재 세션만 완료로 확인한다.
            try { await api.post('/api/auth/mfa/completion', { completionId: completion.reference }, config(signal)); }
            catch { throw failure; }
        }
        assertCurrentSession(completion.epoch);
        signal?.throwIfAborted();
        completion.issued = true;
    }
    assertCurrentSession(session.epoch);
    signal?.throwIfAborted();
    return api.get('/api/member/me', config(signal));
}
