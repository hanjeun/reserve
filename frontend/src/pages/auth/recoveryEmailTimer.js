export const CODE_EXPIRED = '인증 코드가 만료됐어요. 새 코드를 받아주세요.';

export const remainingSeconds = deadline => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

export function formatTimer(seconds) {
    const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
    const rest = String(seconds % 60).padStart(2, '0');
    return `${minutes}:${rest}`;
}
