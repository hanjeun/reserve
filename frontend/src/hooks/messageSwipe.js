const messageTypes = ['success', 'error', 'info', 'warning', 'loading'];
let decorate;
let loading;

export function swipeMessageApi(message) {
    if (!message.open) return message;
    const open = (method, config) => {
        const display = withSwipe => message[method](withSwipe(config));
        if (decorate) return display(decorate);
        // 첫 알림도 표시되기 전에 제스처가 준비되고, 로드 실패 시 기본 알림은 사용할 수 있다.
        loading ??= import('./messageSwipeGesture')
            .then(module => decorate = module.default, () => decorate = options => options);
        let close;
        let canceled = false;
        const promise = loading.then(withSwipe => {
            if (canceled) return true;
            close = display(withSwipe);
            return close;
        });
        return Object.assign(() => { canceled = true; close?.(); }, { promise, then: promise.then.bind(promise) });
    };
    const swipe = {
        ...message,
        open: config => open('open', config),
        destroy: key => {
            if (loading && !decorate) void loading.then(() => message.destroy(key));
            else message.destroy(key);
        },
    };
    for (const type of messageTypes) {
        swipe[type] = (value, duration, onClose) => {
            const config = value && typeof value === 'object' && 'content' in value ? value : { content: value };
            const timing = typeof duration === 'function' ? { onClose: duration } : { duration, onClose };
            return open(type, { ...timing, ...config });
        };
    }
    return swipe;
}
