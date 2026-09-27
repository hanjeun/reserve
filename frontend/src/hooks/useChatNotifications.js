import { useCallback, useEffect, useRef, useState } from 'react';
import useAuthStore from '../store/useAuthStore';
import { messengerIdentityOf } from '../store/useMessengerStore';
import { createChatNotifier } from '../utils/chatNotifications';

const OFF = { status: 'off', enabled: false, permission: 'default' };

/** 열린 메신저의 PC 세션 알림. 초기 이력·닫힌 패널·다른 로그인 세션에는 알리지 않는다. */
export default function useChatNotifications(onOpen) {
    const user = useAuthStore(state => state.user);
    const sessionRevision = useAuthStore(state => state.sessionRevision);
    const identity = messengerIdentityOf({ user, sessionRevision });
    const notifierRef = useRef(null);
    const onOpenRef = useRef(onOpen);
    const [snapshot, setSnapshot] = useState({ identity: null, state: OFF });

    useEffect(() => { onOpenRef.current = onOpen; }, [onOpen]);
    useEffect(() => {
        const instance = createChatNotifier({
            onOpen: roomId => {
                if (notifierRef.current === instance
                    && messengerIdentityOf(useAuthStore.getState()) === identity) {
                    onOpenRef.current?.(roomId);
                }
            },
            onStateChange: state => {
                if (notifierRef.current === instance) setSnapshot({ identity, state });
            },
        });
        notifierRef.current = instance;
        return () => {
            if (notifierRef.current === instance) notifierRef.current = null;
            instance.dispose();
        };
    }, [identity]);

    const enable = useCallback(async () => {
        const instance = notifierRef.current;
        if (!instance || messengerIdentityOf(useAuthStore.getState()) !== identity) return;
        // enable을 클릭 핸들러 안에서 즉시 호출해야 브라우저의 사용자 제스처가 유지된다.
        const state = await instance.enable();
        if (notifierRef.current === instance) setSnapshot({ identity, state });
    }, [identity]);
    const disable = useCallback(() => {
        const instance = notifierRef.current;
        if (instance) setSnapshot({ identity, state: instance.disable() });
    }, [identity]);
    const notify = useCallback(payload => {
        if (messengerIdentityOf(useAuthStore.getState()) !== identity) return false;
        return notifierRef.current?.notify(payload) ?? false;
    }, [identity]);

    return { state: snapshot.identity === identity ? snapshot.state : OFF, enable, disable, notify };
}
