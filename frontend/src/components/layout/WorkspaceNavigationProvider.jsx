import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import PropTypes from 'prop-types';
import { useLocation } from 'react-router-dom';
import useMessage from '../../hooks/useMessage';
import { installWorkspacePopGuard } from '../../utils/workspacePopGuard';
import { WorkspaceNavigationContext } from './workspaceNavigation';
import { zIndex } from '../../styles/tokens';

const isWorkspace = pathname => /^\/(admin|business)\/?$/.test(pathname);

/** 사용자 이동만 확인한다. 인증 만료·강제 로그아웃 등의 자동 보호 이동은 그대로 둔다. */
export default function WorkspaceNavigationProvider({ children }) {
    const location = useLocation();
    const { confirm, message } = useMessage();
    const drafts = useRef(new Map());
    const pendingConfirmation = useRef(null);
    const popGuard = useRef(null);
    const currentLocation = useRef(location);
    const dialogs = useRef({ confirm, message });
    const discardedStates = useRef(new WeakSet());

    useLayoutEffect(() => {
        currentLocation.current = location;
        dialogs.current = { confirm, message };
    }, [location, confirm, message]);
    useLayoutEffect(() => { popGuard.current?.sync(); }, [location.key, location.pathname, location.search, location.hash]);

    const states = useCallback(() => isWorkspace(currentLocation.current.pathname)
        ? [...drafts.current.values()].map(read => read()).filter(item => !discardedStates.current.has(item) && (item.dirty || item.busy))
        : [], []);
    const requestLeave = useCallback(async (action, only, { discard = true } = {}) => {
        if (pendingConfirmation.current) return false;
        const affected = only ? [only()].filter(item => item.dirty || item.busy) : states();
        if (affected.some(item => item.busy)) {
            dialogs.current.message.info('저장·처리가 끝난 뒤 이동해주세요.');
            return false;
        }
        if (!affected.length) { action(); return true; }
        let settle;
        const decision = new Promise(resolve => { settle = resolve; });
        const dialog = dialogs.current.confirm({
            title: '작성 중인 내용이 있어요',
            content: '저장하지 않은 변경을 버리고 이동할까요? 계속 작성하려면 이 화면에 머물러주세요.',
            okText: '변경 버리고 이동', cancelText: '계속 작성',
            zIndex: zIndex.modal + 200,
            onOk: () => settle(true), onCancel: () => settle(false),
        });
        pendingConfirmation.current = { settle, dialog };
        const accepted = await decision;
        pendingConfirmation.current = null;
        if (!accepted) return false;
        const latest = only ? [only()] : states();
        if (latest.some(item => item.busy)) return false;
        if (discard) affected.forEach(item => { discardedStates.current.add(item); item.onDiscard?.(); });
        action();
        return true;
    }, [states]);

    const register = useCallback((id, read) => {
        drafts.current.set(id, read);
        return () => drafts.current.delete(id);
    }, []);

    useEffect(() => {
        popGuard.current = installWorkspacePopGuard({ browser: window, shouldBlock: () => states().length > 0, requestLeave });
        const beforeUnload = event => {
            if (!states().some(state => !state.allowUnload)) return;
            event.preventDefault(); event.returnValue = '';
        };
        // Link의 state와 원래 클릭 동작을 보존해 다시 실행한다. 새 탭·다운로드는 막지 않는다.
        const allowedLinks = new WeakSet();
        const onClick = event => {
            if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !states().length) return;
            const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
            if (!anchor || anchor.hasAttribute('download') || anchor.target && anchor.target !== '_self') return;
            if (allowedLinks.has(anchor)) { allowedLinks.delete(anchor); return; }
            const target = new URL(anchor.href, window.location.href);
            if (target.origin !== window.location.origin || target.href === window.location.href) return;
            if (anchor.closest('.reserve-workspace-navigation')) return;
            event.preventDefault(); event.stopImmediatePropagation();
            void requestLeave(() => {
                if (!anchor.isConnected) return;
                allowedLinks.add(anchor); anchor.click();
            });
        };
        window.addEventListener('beforeunload', beforeUnload);
        document.addEventListener('click', onClick, true);
        return () => {
            popGuard.current?.dispose(); popGuard.current = null;
            window.removeEventListener('beforeunload', beforeUnload);
            document.removeEventListener('click', onClick, true);
            const pending = pendingConfirmation.current;
            pending?.settle(false); pending?.dialog?.destroy();
        };
    }, [states, requestLeave]);

    const value = useMemo(() => ({ register, requestLeave }), [register, requestLeave]);
    return <WorkspaceNavigationContext.Provider value={value}>{children}</WorkspaceNavigationContext.Provider>;
}
WorkspaceNavigationProvider.propTypes = { children: PropTypes.node };
