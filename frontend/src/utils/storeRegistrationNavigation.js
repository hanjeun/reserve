import useAuthStore from '../store/useAuthStore';

export const REGISTRATION_BACK_EVENT = 'reserve:registration-step-back';
const snapshots = new Map();

export const requestRegistrationStepBack = () => {
    const event = new CustomEvent(REGISTRATION_BACK_EVENT, { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
};

// 탭 메모리의 이동 복구와 사용자 디스크 자동 저장 설정을 분리한다.
export const readRegistrationNavigation = key => snapshots.get(key);
export const rememberRegistrationNavigation = (key, snapshot) => {
    snapshots.delete(key);
    snapshots.set(key, snapshot);
    if (snapshots.size > 8) snapshots.delete(snapshots.keys().next().value);
};
export const clearRegistrationNavigation = () => snapshots.clear();

const unsubscribe = useAuthStore.subscribe((current, previous) => {
    if (current.user?.id !== previous.user?.id || current.user?.role !== previous.user?.role
        || current.sessionRevision !== previous.sessionRevision) snapshots.clear();
});
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribe(); snapshots.clear(); });
