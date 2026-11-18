export const AUTHENTICATION_BACK = 'reserve:authentication-back';
export const AUTHENTICATION_HOME = 'reserve:authentication-home';
export function requestAuthenticationBack() {
    return !window.dispatchEvent(new Event(AUTHENTICATION_BACK, { cancelable: true }));
}
export function requestAuthenticationHome() {
    return !window.dispatchEvent(new Event(AUTHENTICATION_HOME, { cancelable: true }));
}
