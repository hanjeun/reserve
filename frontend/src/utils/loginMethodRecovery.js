import useAuthStore from '../store/useAuthStore';
import { isResponseUnconfirmed } from './errorHandler';
import { socialLoginLabel } from './oauthAuthorization';

const NOTICE_TTL_MS = 120_000;
let pendingChange;

export function loginMethodRecoveryText(method) {
    const label = method === 'EMAIL' ? '이메일' : socialLoginLabel(method);
    return '로그인 방법 변경 결과를 확인하지 못했어요. '
        + (label ? label + '로 다시 로그인한 뒤 ' : '사용할 수 있는 방법으로 다시 로그인한 뒤 ')
        + '보안 설정에서 확인해주세요.';
}

export function pendingLoginMethodNotice(sessionRevision) {
    // 변경을 보낸 세션 바로 다음의 로그아웃 화면에만 안내한다.
    if (pendingChange?.owner.revision + 1 === sessionRevision && Date.now() < pendingChange.expiresAt) {
        return pendingChange.method;
    }
    return null;
}

export function clearPendingLoginMethodNotice(sessionRevision) {
    if (pendingChange?.owner.revision + 1 === sessionRevision) pendingChange = null;
}

export async function runLoginMethodMutation(owner, method, submit, onUnconfirmed) {
    const attempt = { owner, method: method || 'AVAILABLE', expiresAt: Date.now() + NOTICE_TTL_MS };
    pendingChange = attempt;
    return useAuthStore.getState().withAuthTransition(async () => {
        try {
            await submit();
        } catch (error) {
            if (error?.isStaleSession || error?.isSessionExpired) return false;
            if (error?.status === 401 || isResponseUnconfirmed(error)) {
                await onUnconfirmed(attempt);
                return false;
            }
            if (pendingChange === attempt) pendingChange = null;
            throw error;
        }
        if (pendingChange === attempt) pendingChange = null;
        return true;
    });
}
