import { describe, expect, it, vi } from 'vitest';
import { createChatNotifier } from '../chatNotifications';

const incoming = (id, senderRole = 'OWNER') => ({ id, senderRole });
const packet = (id, roomId = 1) => ({ roomId, messages: [incoming(id)], viewerRole: 'MEMBER' });

const setup = ({ initialPermission = 'granted', secure = true, foreground = false } = {}) => {
    const instances = [];
    class NotificationMock {
        static permission = initialPermission;
        static requestPermission = vi.fn(async () => {
            NotificationMock.permission = 'granted';
            return 'granted';
        });

        constructor(title, options) {
            this.title = title;
            this.options = options;
            this.close = vi.fn();
            instances.push(this);
        }
    }
    const context = { secure, foreground, timestamp: 1000 };
    const onOpen = vi.fn();
    const onStateChange = vi.fn();
    const notifier = createChatNotifier({
        NotificationApi: NotificationMock,
        isSecureContext: () => context.secure,
        isForeground: () => context.foreground,
        now: () => context.timestamp,
        onOpen,
        onStateChange,
    });
    return { notifier, NotificationMock, instances, context, onOpen, onStateChange };
};

const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};

describe('session chat notifications', () => {
    it('starts OFF even when the browser already granted permission', () => {
        const { notifier, instances, NotificationMock } = setup();
        expect(notifier.getState()).toEqual({ status: 'off', enabled: false, permission: 'granted' });
        expect(notifier.notify(packet(1))).toBe(false);
        expect(instances).toHaveLength(0);
        expect(NotificationMock.requestPermission).not.toHaveBeenCalled();
    });

    it('enables pre-granted permission only after explicit enable, without a new request', async () => {
        const { notifier, NotificationMock } = setup();
        expect(await notifier.enable()).toEqual({ status: 'enabled', enabled: true, permission: 'granted' });
        await notifier.enable();
        expect(NotificationMock.requestPermission).not.toHaveBeenCalled();
    });

    it('requests permission synchronously inside enable and coalesces repeated clicks', async () => {
        const { notifier, NotificationMock } = setup({ initialPermission: 'default' });
        const request = deferred();
        NotificationMock.requestPermission.mockReturnValue(request.promise);
        const first = notifier.enable();
        const second = notifier.enable();
        expect(first).toBe(second);
        expect(NotificationMock.requestPermission).toHaveBeenCalledTimes(1);
        expect(notifier.getState().status).toBe('requesting');
        NotificationMock.permission = 'granted';
        request.resolve('granted');
        expect((await first).enabled).toBe(true);
    });

    it.each([
        ['denied', { initialPermission: 'denied' }],
        ['insecure', { secure: false }],
    ])('does not prompt when %s', async (status, config) => {
        const { notifier, NotificationMock, instances } = setup(config);
        expect((await notifier.enable()).status).toBe(status);
        expect(notifier.notify(packet(1))).toBe(false);
        expect(NotificationMock.requestPermission).not.toHaveBeenCalled();
        expect(instances).toHaveLength(0);
    });

    it('reports unsupported environments without requesting or throwing', async () => {
        const notifier = createChatNotifier({ NotificationApi: null, isSecureContext: true });
        expect((await notifier.enable()).status).toBe('unsupported');
        expect(notifier.notify(packet(1))).toBe(false);
        notifier.dispose();
    });

    it.each(['disable', 'dispose'])('never resurrects opt-in after %s during a permission request', async (action) => {
        const { notifier, NotificationMock } = setup({ initialPermission: 'default' });
        const request = deferred();
        NotificationMock.requestPermission.mockReturnValue(request.promise);
        const enabling = notifier.enable();
        notifier[action]();
        NotificationMock.permission = 'granted';
        request.resolve('granted');
        expect((await enabling).enabled).toBe(false);
        expect(notifier.getState().status).toBe(action === 'dispose' ? 'disposed' : 'off');
    });

    it('fences an old request from a later permission request', async () => {
        const { notifier, NotificationMock } = setup({ initialPermission: 'default' });
        const oldRequest = deferred();
        const newRequest = deferred();
        NotificationMock.requestPermission
            .mockReturnValueOnce(oldRequest.promise)
            .mockReturnValueOnce(newRequest.promise);
        const first = notifier.enable();
        notifier.disable();
        const second = notifier.enable();
        oldRequest.resolve('granted');
        expect((await first).enabled).toBe(false);
        expect(notifier.getState().status).toBe('requesting');
        NotificationMock.permission = 'granted';
        newRequest.resolve('granted');
        expect((await second).enabled).toBe(true);
    });

    it('remains OFF when the prompt is dismissed or denied', async () => {
        for (const result of ['default', 'denied']) {
            const { notifier, NotificationMock } = setup({ initialPermission: 'default' });
            NotificationMock.requestPermission.mockImplementation(async () => {
                NotificationMock.permission = result;
                return result;
            });
            const state = await notifier.enable();
            expect(state.enabled).toBe(false);
            expect(state.status).toBe(result === 'denied' ? 'denied' : 'off');
        }
    });

    it('fails closed when the returned grant is inconsistent with live permission', async () => {
        const { notifier, NotificationMock } = setup({ initialPermission: 'default' });
        NotificationMock.requestPermission.mockResolvedValue('granted');
        expect((await notifier.enable()).enabled).toBe(false);
    });

    it.each(['throw', 'reject'])('handles permission %s without rejecting enable', async (mode) => {
        const { notifier, NotificationMock } = setup({ initialPermission: 'default' });
        NotificationMock.requestPermission.mockImplementation(() => {
            if (mode === 'throw') throw new Error('mock permission failure');
            return Promise.reject(new Error('mock permission failure'));
        });
        expect((await notifier.enable()).status).toBe('error');
    });

    it('uses only generic OS payload and never reads private message fields', async () => {
        const { notifier, instances } = setup();
        await notifier.enable();
        const secret = incoming(1);
        for (const key of ['content', 'storeName', 'memberName', 'counterpartName']) {
            Object.defineProperty(secret, key, { get: () => { throw new Error('private field read'); } });
        }
        expect(notifier.notify({ ...packet(1), messages: [secret] })).toBe(true);
        expect(instances[0].title).toBe('RESERVE 새 메시지');
        expect(instances[0].options).toEqual({
            body: '새 메시지가 도착했어요. RESERVE에서 확인해주세요.',
            tag: 'reserve-chat',
        });
    });

    it('ignores own, optimistic, malformed and unknown-role messages', async () => {
        const { notifier, instances } = setup();
        await notifier.enable();
        expect(notifier.notify({ roomId: 1, viewerRole: 'MEMBER', messages: [
            incoming(1, 'MEMBER'), incoming(-2), incoming(0), incoming('3'),
            incoming(1.5), incoming(Number.MAX_SAFE_INTEGER + 1), incoming(4, 'SYSTEM'), null,
        ] })).toBe(false);
        expect(notifier.notify({ ...packet(5), roomId: -1 })).toBe(false);
        expect(notifier.notify({ ...packet(5), viewerRole: 'SYSTEM' })).toBe(false);
        expect(instances).toHaveLength(0);
        expect(notifier.notify(packet(5))).toBe(true);
    });

    it('accepts the opposite MEMBER for an OWNER and ADMIN for a MEMBER', async () => {
        const { notifier, context, instances } = setup();
        await notifier.enable();
        expect(notifier.notify({ roomId: 1, viewerRole: 'OWNER', messages: [incoming(1, 'MEMBER')] })).toBe(true);
        context.timestamp += 60000;
        expect(notifier.notify({ roomId: 2, viewerRole: 'MEMBER', messages: [incoming(2, 'ADMIN')] })).toBe(true);
        expect(instances).toHaveLength(2);
    });

    it('deduplicates room/id and suppresses older server replay regardless of batch order', async () => {
        const { notifier, context, instances } = setup();
        await notifier.enable();
        expect(notifier.notify({ ...packet(3), messages: [incoming(3), incoming(2), incoming(3)] })).toBe(true);
        context.timestamp += 60000;
        expect(notifier.notify(packet(3))).toBe(false);
        expect(notifier.notify(packet(1))).toBe(false);
        expect(notifier.notify(packet(3, 2))).toBe(true);
        expect(instances).toHaveLength(2);
    });

    it('marks foreground messages seen before a later background call', async () => {
        const { notifier, context } = setup({ foreground: true });
        await notifier.enable();
        expect(notifier.notify(packet(1))).toBe(false);
        context.foreground = false;
        expect(notifier.notify(packet(1))).toBe(false);
        expect(notifier.notify(packet(2))).toBe(true);
    });

    it('does not retroactively notify messages observed before opt-in or while disabled', async () => {
        const { notifier, context } = setup();
        notifier.notify(packet(1));
        await notifier.enable();
        expect(notifier.notify(packet(1))).toBe(false);
        expect(notifier.notify(packet(2))).toBe(true);
        notifier.disable();
        notifier.notify(packet(3));
        await notifier.enable();
        context.timestamp += 60000;
        expect(notifier.notify(packet(3))).toBe(false);
        expect(notifier.notify(packet(4))).toBe(true);
    });

    it('throttles globally for 60 seconds and does not defer suppressed messages', async () => {
        const { notifier, context, instances } = setup();
        await notifier.enable();
        expect(notifier.notify(packet(1))).toBe(true);
        context.timestamp += 59999;
        expect(notifier.notify(packet(1, 2))).toBe(false);
        context.timestamp += 1;
        expect(notifier.notify(packet(1, 2))).toBe(false);
        expect(notifier.notify(packet(2, 2))).toBe(true);
        expect(instances).toHaveLength(2);
    });

    it('bounds tracked rooms to a 50-room LRU without retaining message data', async () => {
        const { notifier, context } = setup({ foreground: true });
        await notifier.enable();
        for (let roomId = 1; roomId <= 50; roomId += 1) notifier.notify(packet(1, roomId));
        notifier.notify(packet(1, 1)); // 기존 방을 최신 사용으로 옮긴다.
        notifier.notify(packet(1, 51));
        context.foreground = false;
        expect(notifier.notify(packet(1, 1))).toBe(false);
        expect(notifier.notify(packet(1, 2))).toBe(true); // 가장 오래된 방만 제거됐다.
    });

    it('disables and closes the displayed notification when permission is revoked', async () => {
        const { notifier, NotificationMock, instances } = setup();
        await notifier.enable();
        notifier.notify(packet(1));
        NotificationMock.permission = 'denied';
        expect(notifier.getState()).toEqual({ status: 'denied', enabled: false, permission: 'denied' });
        expect(instances[0].close).toHaveBeenCalledTimes(1);
        expect(notifier.notify(packet(2))).toBe(false);
    });

    it('disables gracefully when the desktop constructor fails', async () => {
        class BrokenNotification {
            static permission = 'granted';
            static requestPermission = vi.fn();
            constructor() { throw new TypeError('mock mobile/OS constructor failure'); }
        }
        const notifier = createChatNotifier({
            NotificationApi: BrokenNotification, isSecureContext: true, isForeground: false,
        });
        await notifier.enable();
        expect(notifier.notify(packet(1))).toBe(false);
        expect(notifier.getState()).toEqual({ status: 'error', enabled: false, permission: 'granted' });
    });

    it('allows explicit re-enable after the user repairs denied permission in browser settings', async () => {
        const { notifier, NotificationMock } = setup({ initialPermission: 'denied' });
        expect((await notifier.enable()).status).toBe('denied');
        NotificationMock.permission = 'granted';
        expect(notifier.getState().enabled).toBe(false);
        expect((await notifier.enable()).enabled).toBe(true);
        expect(NotificationMock.requestPermission).not.toHaveBeenCalled();
    });

    it('fails closed if foreground detection throws', async () => {
        const { NotificationMock, instances } = setup();
        const notifier = createChatNotifier({
            NotificationApi: NotificationMock,
            isSecureContext: true,
            isForeground: () => { throw new Error('mock visibility failure'); },
        });
        await notifier.enable();
        expect(notifier.notify(packet(1))).toBe(false);
        expect(instances).toHaveLength(0);
    });

    it('opens only the current notification room and ignores stale click callbacks', async () => {
        const { notifier, context, instances, onOpen } = setup();
        await notifier.enable();
        notifier.notify(packet(1, 12));
        const oldClick = instances[0].onclick;
        context.timestamp += 60000;
        notifier.notify(packet(2, 13));
        oldClick();
        expect(onOpen).not.toHaveBeenCalled();
        instances[1].onclick();
        expect(onOpen).toHaveBeenCalledWith(13);
        expect(instances[0].close).toHaveBeenCalledTimes(1);
        expect(instances[1].close).toHaveBeenCalledTimes(1);
    });

    it('does not reopen a room after disable or a permission change', async () => {
        const { notifier, instances, onOpen } = setup();
        await notifier.enable();
        notifier.notify(packet(1));
        const click = instances[0].onclick;
        notifier.disable();
        click();
        expect(onOpen).not.toHaveBeenCalled();
    });

    it('disposes idempotently, closes session notifications and prevents all future actions', async () => {
        const { notifier, instances, onOpen, NotificationMock } = setup();
        await notifier.enable();
        notifier.notify(packet(1));
        const click = instances[0].onclick;
        notifier.dispose();
        notifier.dispose();
        click();
        expect((await notifier.enable()).status).toBe('disposed');
        expect(notifier.notify(packet(2))).toBe(false);
        expect(instances[0].close).toHaveBeenCalledTimes(1);
        expect(onOpen).not.toHaveBeenCalled();
        expect(NotificationMock.requestPermission).not.toHaveBeenCalled();
    });

    it('keeps UI callback errors out of the notification lifecycle', async () => {
        const { NotificationMock, instances } = setup();
        const notifier = createChatNotifier({
            NotificationApi: NotificationMock,
            isSecureContext: true,
            isForeground: false,
            onStateChange: () => { throw new Error('mock UI teardown'); },
            onOpen: () => { throw new Error('mock inaccessible room'); },
        });
        expect((await notifier.enable()).enabled).toBe(true);
        expect(notifier.notify(packet(1))).toBe(true);
        expect(() => instances[0].onclick()).not.toThrow();
        notifier.dispose();
    });
});
