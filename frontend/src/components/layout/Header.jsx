import React, { lazy, Suspense, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowLeftOutlined, MenuOutlined, SearchOutlined } from '../common/icons';
import { Link, useLocation, useNavigationType } from 'react-router-dom';
import useReducedMotion from '../../hooks/useReducedMotion';
import useGoBack from '../../hooks/useGoBack';
import useWorkspaceNavigate from '../../hooks/useWorkspaceNavigate';
import useWorkspaceAction from '../../hooks/useWorkspaceAction';
import useExitAnimation from '../../hooks/useExitAnimation';
import { isDiscoveryRootPath } from '../../constants/discovery';
import useAuthStore from '../../store/useAuthStore';
import Button from '../common/Button';
import Tooltip from '../common/Tooltip';
import { requestMessengerRouteClose } from '../chat/messengerRouteTransition';
import { requestRegistrationStepBack } from '../../utils/storeRegistrationNavigation';
import { useSkeletonShown } from './loadingPresentation';
import { colors, heights, fontWeight, radius } from '../../styles/tokens';
import { WorkspaceMenuContext } from './workspaceMenu';
import { SEARCH_MOTION_DURATION_MS } from './searchTransition';

const HeaderAccountMenu = lazy(() => import('./HeaderAccountMenu'));
const HEADER_ACTION_MOTION_MS = 180;

function HeaderControlSlot({ kind, leaving, skipEntry = false, children }) {
    const [animateEntry] = useState(() => !skipEntry);
    return <span className={`reserve-header-control-slot reserve-header-${kind}-slot`
        + (animateEntry ? ' reserve-header-control-slot--entering' : '')
        + (leaving ? ' reserve-header-control-slot--leaving' : '')}
        aria-hidden={leaving ? true : undefined}>{children}</span>;
}
HeaderControlSlot.propTypes = {
    kind: PropTypes.oneOf(['back', 'workspace-menu']).isRequired,
    leaving: PropTypes.bool,
    skipEntry: PropTypes.bool,
    children: PropTypes.node,
};

const Header = () => {
    const skeletonShown = useSkeletonShown();
    const navigate = useWorkspaceNavigate();
    const requestAction = useWorkspaceAction();
    const location = useLocation();
    const navigationType = useNavigationType();
    const reducedMotion = useReducedMotion();
    const { isLoggedIn } = useAuthStore();
    const currentPath = location.pathname.replace(/\/$/, '') || '/';
    const workspaceControls = useContext(WorkspaceMenuContext);
    const workspaceMenu = workspaceControls?.control;
    const showWorkspaceMenu = isLoggedIn && /^\/(admin|business)$/.test(currentPath);
    const menu = workspaceMenu?.pathname.replace(/\/$/, '') === currentPath ? workspaceMenu : null;
    const menuAction = menu?.mobile ? (menu.expanded ? '닫기' : '열기') : (menu?.expanded ? '접기' : '펼치기');
    const menuLabel = `${menu?.title || (currentPath === '/admin' ? '관리자 패널' : '사업자 파트너 패널')} 메뉴 ${menuAction}`;
    const isDiscoveryRoot = isDiscoveryRootPath(location.pathname, location.search);
    const showBack = !isDiscoveryRoot;
    const goBack = useGoBack(currentPath === '/stores' || currentPath.startsWith('/store/') ? '/stores' : '/');
    const [navigationIntent, setNavigationIntent] = useState(null);
    const navigationTimerRef = useRef(null);
    const navigationStartRef = useRef(/** @type {string | null} */ (null));
    const navigationLocationRef = useRef({ location, navigationType });
    useLayoutEffect(() => { navigationLocationRef.current = { location, navigationType }; }, [location, navigationType]);
    // 뒤로가기 버튼은 사라질 때도 나타날 때와 같은 접힘 모션을 탄다(2026-09-26).
    // 예전엔 ← 를 직접 눌렀을 때만 접혔고, 로고·하단 탭·브라우저 뒤로가기로 탐색 루트에 돌아갈 때는
    // 버튼이 그 자리에서 언마운트돼 RESERVE 로고가 48px 뚝 튀었다(사용자 지적).
    // 이제 showBack 이 꺼져도 모션 시간만큼 더 남겨 두고 같은 --leaving 애니메이션을 재생한다.
    // 로고 자체는 여전히 움직이지 않고 기다리지도 않는다 — 버튼 자리가 접히면서 로고가 따라 미끄러질 뿐이다.
    const { shouldRender: backMounted } = useExitAnimation(showBack, HEADER_ACTION_MOTION_MS);
    const { shouldRender: workspaceMounted } = useExitAnimation(showWorkspaceMenu, HEADER_ACTION_MOTION_MS);
    // 모션 최소화에서는 애니메이션이 꺼져 있으므로 남겨 둘 이유가 없다 — 즉시 나타나고 사라진다.
    const renderBack = reducedMotion ? showBack : backMounted;
    const renderWorkspaceMenu = reducedMotion ? showWorkspaceMenu : workspaceMounted;
    // 버튼이 계속 필요한 경로 사이에서는 같은 DOM을 유지하고, 실제로 없어질 때만 접는다.
    const backLeaving = renderBack && !showBack;
    const workspaceLeaving = renderWorkspaceMenu && !showWorkspaceMenu;
    const keyword = currentPath === '/stores' ? new URLSearchParams(location.search).get('keyword')?.trim() : '';
    const searchTarget = keyword ? '/search?keyword=' + encodeURIComponent(keyword) : '/search';
    const searchLeaving = navigationIntent?.intent === 'search'
        && navigationIntent.pathname === location.pathname && navigationIntent.hash === location.hash;

    const cancelNavigation = useCallback(() => {
        if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current);
        navigationTimerRef.current = null;
        navigationStartRef.current = null;
        // 같은 history key로 앞으로 돌아와도 완료된 이동의 잠금이 되살아나지 않는다.
        setNavigationIntent(null);
    }, []);
    useEffect(() => () => {
        const next = navigationLocationRef.current;
        // 같은 화면의 기본 선택 주소 보정은 이미 누른 검색 이동을 취소하지 않는다.
        if (next.navigationType === 'REPLACE' && next.location.key !== location.key
            && next.location.pathname === location.pathname && next.location.hash === location.hash) return;
        cancelNavigation();
    }, [location.key, location.pathname, location.hash, cancelNavigation]);
    useEffect(() => cancelNavigation, [cancelNavigation]);

    // 검색은 퇴장 모션 뒤 이동하고 뒤로가기는 바로 이동한다. 중복 이동 잠금은 경로 커밋까지 유지한다.
    // 로고는 모션 없이 바로 이동한다(handleLogoClick).
    const runHeaderNavigation = useCallback((intent, action) => {
        if (navigationStartRef.current !== null) return;
        navigationStartRef.current = location.key;
        if (intent === 'back' || reducedMotion) {
            action();
            return;
        }

        setNavigationIntent({ intent, pathname: location.pathname, hash: location.hash });
        navigationTimerRef.current = window.setTimeout(() => {
            navigationTimerRef.current = null;
            // POP 이동은 비동기다. 경로 커밋 전 intent를 풀면 enter → leave가 다시 재생된다.
            action();
        }, intent === 'search' ? SEARCH_MOTION_DURATION_MS : HEADER_ACTION_MOTION_MS);
    }, [reducedMotion, location.key, location.pathname, location.hash]);

    const handleBack = () => {
        const storeQuestions = currentPath === '/store/register' || /^\/store\/\d+\/edit$/.test(currentPath);
        if (storeQuestions && requestRegistrationStepBack()) return;
        if (currentPath === '/messages' && requestMessengerRouteClose()) return;
        void requestAction(() => runHeaderNavigation('back', goBack));
    };

    const handleSearchEntry = event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        void requestAction(() => runHeaderNavigation('search', () => navigate(searchTarget, { state: { searchEntry: true } })));
    };

    // RESERVE 로고는 움직이지 않는다 — 눌림·축소·대기 없이 바로 이동한다(2026-09-21 사용자 결정:
    // "로고가 클릭되면서 안으로 들어가는 모션은 싫다, 로고는 정적이고 페이지만 움직이게").
    // 도착한 홈의 준비된 영역만 들어온다. 아래 가게 목록의 로딩은 이 이동을 취소하지 않는다.
    // 홈에서 누르면 맨 위로 스크롤만 한다.
    const handleLogoClick = (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        if (location.pathname === '/') {
            window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
            return;
        }
        // 메시지 화면에서는 뒤로가기 버튼과 같이 닫힘 애니메이션을 먼저 재생하고 홈으로 간다.
        // 메시지 화면을 떠나는 이동에는 페이지 전환 슬라이드가 걸리지 않아 두 애니메이션이 겹치지 않는다.
        if (currentPath === '/messages' && requestMessengerRouteClose('/')) return;
        navigate('/', { state: { reserveRouteMotion: 'from-left', reserveHomeEntry: true } });
    };

    // 주의: 정지/영구정지 회원은 이제 로그인 자체가 차단되므로(이메일/소셜 공통)
    // 로그인된 상태에서 배너를 띄우는 분기는 더 이상 필요하지 않음 — 완전히 제거됨
    return (
        <header data-skeleton-shown={skeletonShown ? 'true' : undefined} className={'reserve-header' + (keyword ? ' reserve-header-has-query' : '') + (!isLoggedIn ? ' reserve-header-is-guest' : '') + (showBack ? ' reserve-header-has-back' : '') + (renderWorkspaceMenu ? ' reserve-header-has-workspace-menu' : '') + (searchLeaving ? ' reserve-header--search-leaving' : '')}
            inert={searchLeaving ? true : undefined} aria-busy={searchLeaving || undefined}
            style={{ ...(isDiscoveryRoot ? { ...styles.header, boxShadow: 'none' } : styles.header), '--reserve-search-motion-duration': `${SEARCH_MOTION_DURATION_MS}ms` }}>
            <div className="reserve-header-inner" style={styles.inner}>
                <div className="reserve-header-brand">
                    {renderWorkspaceMenu && <HeaderControlSlot kind="workspace-menu" leaving={workspaceLeaving} skipEntry={skeletonShown}>
                    <Tooltip title={menuLabel} disabled={workspaceLeaving || searchLeaving || menu?.mobile && menu.expanded}><button type="button" id={menu?.buttonId} className="reserve-header-workspace-menu"
                        onClick={menu?.toggle} disabled={!menu || workspaceLeaving}
                        data-input-modality={workspaceControls?.inputModality}
                        aria-label={menuLabel}
                        aria-expanded={menu?.expanded ?? false} aria-controls={menu?.controlsId}
                        aria-haspopup={menu?.mobile ? 'dialog' : undefined}>
                        <MenuOutlined aria-hidden="true" />
                    </button></Tooltip></HeaderControlSlot>}
                    {renderBack && (
                        <HeaderControlSlot kind="back" leaving={backLeaving}>
                        <Tooltip title="이전 화면으로 돌아가기" disabled={backLeaving || searchLeaving}><button type="button" className={'reserve-header-back' + (backLeaving ? ' reserve-header-back--leaving' : '')}
                            onClick={handleBack} aria-label="이전 화면으로 돌아가기" disabled={backLeaving}
                            aria-hidden={showBack ? undefined : true}>
                            <ArrowLeftOutlined aria-hidden="true" />
                        </button></Tooltip></HeaderControlSlot>
                    )}
                    <a className="reserve-header-logo"
                        href="/" onClick={handleLogoClick} style={styles.logo} aria-label="RESERVE 홈">
                        <span className="reserve-header-logo-wordmark" aria-hidden="true">RESERVE</span>
                    </a>
                </div>
                {keyword && (
                    <Link to={searchTarget} state={{ searchEntry: true }} onClick={handleSearchEntry} className="reserve-header-query" aria-label={'검색어 수정: ' + keyword} title={keyword}>
                        <SearchOutlined aria-hidden="true" />
                        <span className="reserve-header-query-text">{keyword}</span>
                    </Link>
                )}
                <div className="reserve-header-actions" style={styles.actions}>
                    {!keyword && (
                        <Tooltip title="가게·지역·서비스 검색" disabled={searchLeaving}><Link to={searchTarget} state={{ searchEntry: true }} onClick={handleSearchEntry} className="reserve-header-search" aria-label="가게·지역·서비스 검색">
                            <SearchOutlined aria-hidden="true" />
                        </Link></Tooltip>
                    )}
                    {isLoggedIn ? (
                        <Suspense fallback={<span className="reserve-header-account-loading" aria-hidden="true" style={styles.avatarFallback} />}>
                            <HeaderAccountMenu />
                        </Suspense>
                    ) : (
                        <div className="reserve-header-guest-actions" style={styles.guestActions}>
                            <Button variant="ghost" size="md" onClick={() => navigate('/login')} style={styles.navBtn}>로그인</Button>
                            <Button variant="primary" size="md" onClick={() => navigate('/signup')} style={styles.actionBtn}>시작하기</Button>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};

/**
 * 앱 첫 로딩(로그인 확인) 동안 App 부트 셸이 그리는 정적 헤더(2026-09-29).
 * 진짜 헤더와 같은 틀·같은 RESERVE 로고 자리만 두고, 계정 메뉴·검색처럼 API 나 로그인 상태가 필요한 것은 그리지 않는다.
 * 예전엔 빈 64px 띠만 있어 헤더가 비어 보였다. 뒤로가기 버튼은 두지 않는다 — 진짜 헤더가 붙을 때 그 버튼은
 * 펼침 모션으로 들어오므로 로고가 옆으로 미끄러질 뿐 튀지 않는다.
 */
export function HeaderPlaceholder({ discoveryRoot = false, workspace = false }) {
    return (
        <div className={'reserve-boot-shell-header' + (workspace ? ' reserve-header-has-workspace-menu' : '')} aria-hidden="true" style={discoveryRoot ? { ...styles.header, boxShadow: 'none' } : styles.header}>
            <div className="reserve-header-inner" style={styles.inner}>
                <div className="reserve-header-brand">
                    {workspace && <span className="reserve-header-control-slot reserve-header-workspace-menu-slot"><span className="reserve-header-workspace-menu"><MenuOutlined /></span></span>}
                    <span className="reserve-header-logo" style={{ color: styles.logo.color }}>
                        <span className="reserve-header-logo-wordmark">RESERVE</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
HeaderPlaceholder.propTypes = { discoveryRoot: PropTypes.bool, workspace: PropTypes.bool };

const styles = {
    header: {
        // 반투명 + blur(스크롤 시 콘텐츠가 비쳐 보이는 유리 효과)라 불투명 토큰을 그대로 쓸 수 없다.
        // theme.css가 라이트/다크에서 각각 흰색·어두운색 반투명 값을 넣어준다.
        // 폴백은 기존 값과 동일한 rgba(255,255,255,0.9) — 변수를 못 읽어도 라이트 모드는 그대로다.
        backgroundColor: 'var(--c-header-bg, rgba(255, 255, 255, 0.9))',
        backdropFilter: 'blur(20px)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 0,
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        // 구분선은 border 가 아니라 안쪽 그림자다 — border 는 64px 안에서 1px 를 먹어 로고가 9.5px 에 놓이고,
        // 구분선 없는 홈(10px)으로 이동할 때 로고가 반 픽셀 튀었다(2026-09-23 실측).
        boxShadow: `inset 0 -1px 0 ${colors.border.light}`,
        height: heights.header,
        width: '100%',
        boxSizing: 'border-box',
    },
    inner: {
        width: '100%',
        maxWidth: 1248,
        height: '100%',
        margin: '0 auto',
        padding: '0 24px',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    logo: {
        color: colors.primary.main,
        textDecoration: 'none',
        cursor: 'pointer',
    },
    actions: { display: 'flex', alignItems: 'center' },
    guestActions: { display: 'flex', alignItems: 'center', gap: 4 },
    navBtn: { color: colors.text.secondary, fontWeight: fontWeight.semibold, borderRadius: radius.md, height: heights.buttonMd, padding: '0 4px', whiteSpace: 'nowrap' },
    actionBtn: { borderRadius: radius.md, fontWeight: fontWeight.semibold, border: 'none', height: heights.buttonMd, padding: '0 12px', whiteSpace: 'nowrap' },
    avatarFallback: { width: 36, height: 36, borderRadius: radius.full, background: colors.primary.light },
};

export default Header;
