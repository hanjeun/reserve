export const AUTHENTICATION_BACK = 'reserve:authentication-back';
export function requestAuthenticationBack() {
    return !window.dispatchEvent(new Event(AUTHENTICATION_BACK, { cancelable: true }));
}
