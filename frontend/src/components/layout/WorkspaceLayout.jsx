import { useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Drawer, Layout } from 'antd';
import { useLocation } from 'react-router-dom';
import PageContainer from '../common/PageContainer';
import { PageTitle } from '../common/PageTypography';
import { CloseOutlined } from '../common/icons';
import useReducedMotion from '../../hooks/useReducedMotion';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import { breakpoints, heights, zIndex } from '../../styles/tokens';
import { WorkspaceMenuContext } from './workspaceMenu';

const { Sider, Content } = Layout;
const CONTENT_TOP = Number.parseInt(heights.header, 10) + 24;

/** 두 관리 패널과 해당 로딩 화면의 메뉴·제목·작업 영역을 함께 배치한다. */
export default function WorkspaceLayout({ title, groups, activeKey, hrefFor, onSelect, loading = false, children }) {
    const id = useId();
    const { pathname } = useLocation();
    const { publish, clear } = useContext(WorkspaceMenuContext) || {};
    const mobile = useWindowWidth() < breakpoints.pc;
    const reducedMotion = useReducedMotion();
    const [menuOpen, setMenuOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [menuKey, setMenuKey] = useState(activeKey);
    if (menuKey !== activeKey) { setMenuKey(activeKey); setMenuOpen(false); }
    if (menuOpen && !mobile) setMenuOpen(false);
    const headingRef = useRef(null);
    const focusAfterClose = useRef(false);
    const drawerFocusTarget = useRef('menu');
    const previousOpen = useRef(false);
    const previousKey = useRef(activeKey);
    const active = groups.flatMap(group => group.items).find(item => item.key === activeKey);
    const Icon = active?.icon;
    const heading = active?.label || title;
    useDocumentTitle(heading);
    const focusMenu = useCallback(() => document.getElementById(`${id}-toggle`)?.focus({ preventScroll: true }), [id]);
    // 입장 모션이 끝나기 전에 닫아도 메뉴 버튼으로 복귀한다. 완료 콜백이 생략될 수 있다.
    useEffect(() => {
        if (previousOpen.current && !menuOpen && drawerFocusTarget.current === 'menu') focusMenu();
        previousOpen.current = menuOpen;
    }, [menuOpen, focusMenu]);
    const toggleMenu = useCallback(() => {
        if (mobile) { drawerFocusTarget.current = 'menu'; setMenuOpen(open => !open); }
        else setSidebarOpen(open => !open);
    }, [mobile]);
    useLayoutEffect(() => {
        if (loading || !publish) return;
        publish({ owner: id, pathname, title, mobile, expanded: mobile ? menuOpen : sidebarOpen,
            buttonId: `${id}-toggle`, controlsId: mobile ? (menuOpen ? `${id}-drawer` : undefined) : `${id}-side`, toggle: toggleMenu });
    }, [publish, id, pathname, title, mobile, menuOpen, sidebarOpen, loading, toggleMenu]);
    useLayoutEffect(() => () => { clear?.(id); }, [clear, id]);
    const focusContent = useCallback(() => {
        const headingElement = headingRef.current?.querySelector('.reserve-page-title');
        if (!focusAfterClose.current || !headingElement || document.documentElement.dataset.reserveModalOpen === 'true') return;
        focusAfterClose.current = false;
        headingElement.focus({ preventScroll: true });
        const top = headingElement.getBoundingClientRect().top + window.scrollY - CONTENT_TOP;
        window.scrollTo({ top: Math.max(0, top), behavior: 'instant' });
    }, []);

    // 같은 기능의 필터 업데이트는 위치를 유지하고 기능 이동만 작업 영역으로 돌아온다.
    useEffect(() => {
        if (loading) { previousKey.current = activeKey; return; }
        if (previousKey.current === activeKey) return;
        previousKey.current = activeKey;
        focusAfterClose.current = true;
        focusContent();
    }, [activeKey, loading, focusContent]);
    useEffect(() => {
        let frame;
        const afterUnlock = () => { frame = requestAnimationFrame(focusContent); };
        document.addEventListener('reserve:modal-unlocked', afterUnlock);
        return () => { document.removeEventListener('reserve:modal-unlocked', afterUnlock); cancelAnimationFrame(frame); };
    }, [focusContent]);

    const select = key => {
        if (key === activeKey) { drawerFocusTarget.current = 'content'; focusAfterClose.current = true; setMenuOpen(false); if (!menuOpen) focusContent(); return; }
        // Guarded navigation resolves only after the user has kept or discarded their draft.
        Promise.resolve(onSelect(key)).then(changed => {
            if (changed !== false) { drawerFocusTarget.current = 'content'; setMenuOpen(false); }
        });
    };
    const navigation = surface => <nav className="reserve-workspace-navigation" aria-label={`${title} 메뉴`}>
        {groups.map(group => <section className="reserve-workspace-menu-group" key={group.key} aria-labelledby={`${id}-${surface}-${group.key}`}>
            <h2 id={`${id}-${surface}-${group.key}`}>{group.label}</h2>
            <ul>{group.items.map(item => {
                const ItemIcon = item.icon;
                const label = <><ItemIcon aria-hidden="true" /><span>{item.label}</span></>;
                if (loading) return <li key={item.key}><span className="reserve-workspace-menu-placeholder"
                    aria-current={item.key === activeKey ? 'page' : undefined}>{label}</span></li>;
                return <li key={item.key}><a href={hrefFor(item.key)} aria-current={item.key === activeKey ? 'page' : undefined}
                    onClick={event => {
                        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                        event.preventDefault();
                        select(item.key);
                    }}>{label}</a></li>;
            })}</ul>
        </section>)}
    </nav>;

    return <PageContainer size="xl" paddingTop="32px" className="reserve-workspace" style={{ '--workspace-sticky-top': `${CONTENT_TOP}px` }}>
        <header ref={headingRef} className="reserve-workspace-heading">
            <PageTitle level={1} tabIndex={loading ? undefined : -1} loading={loading} style={{ margin: 0 }}>
                <span className="reserve-workspace-heading-label">{Icon && <Icon aria-hidden="true" />}<span>{heading}</span></span>
            </PageTitle>
        </header>
        <Layout className={'reserve-workspace-layout' + (!sidebarOpen ? ' is-menu-collapsed' : '')}>
            <Sider width={216} collapsed={!sidebarOpen} collapsedWidth={0} trigger={null} className="reserve-workspace-sider">
                <div id={`${id}-side`} inert={mobile || !sidebarOpen} aria-hidden={mobile || !sidebarOpen ? true : undefined}>{navigation('side')}</div>
            </Sider>
            <Content className="reserve-workspace-main">
                <div className="reserve-workspace-content">{children}</div>
            </Content>
        </Layout>
        <Drawer title={`${title} 메뉴`} placement="left" size="min(320px, calc(100vw - 32px))"
            open={menuOpen && mobile} onClose={() => setMenuOpen(false)}
            closable={{ placement: 'end', 'aria-label': '메뉴 닫기' }}
            destroyOnHidden zIndex={zIndex.modal} push={false} styles={{ header: { minHeight: heights.header } }}
            rootClassName={'reserve-workspace-drawer' + (reducedMotion ? ' is-reduced-motion' : '')}
            closeIcon={<CloseOutlined aria-hidden="true" />}
            afterOpenChange={open => {
                if (open) return;
                if (drawerFocusTarget.current === 'content') {
                    // 목록을 선택했을 때만 작업 제목으로 이동한다. 일반 닫기는 헤더 버튼으로 복귀한다.
                    focusAfterClose.current = true;
                    requestAnimationFrame(focusContent);
                } else requestAnimationFrame(focusMenu);
            }}>
            <div id={`${id}-drawer`}>{navigation('drawer')}</div>
        </Drawer>
    </PageContainer>;
}

WorkspaceLayout.propTypes = {
    title: PropTypes.string.isRequired,
    groups: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.string.isRequired, label: PropTypes.string.isRequired, items: PropTypes.array.isRequired })).isRequired,
    activeKey: PropTypes.string.isRequired,
    hrefFor: PropTypes.func.isRequired,
    onSelect: PropTypes.func,
    loading: PropTypes.bool,
    children: PropTypes.node,
};
