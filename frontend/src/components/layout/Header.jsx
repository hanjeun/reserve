import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useReducedMotion from '../../hooks/useReducedMotion';
import useGoBack from '../../hooks/useGoBack';
import useExitAnimation from '../../hooks/useExitAnimation';
import { isDiscoveryRootPath } from '../../constants/discovery';
import useAuthStore from '../../store/useAuthStore';
import Button from '../common/Button';
import { requestMessengerRouteClose } from '../chat/messengerRouteTransition';
import { colors, heights, fontWeight, radius } from '../../styles/tokens';

const HeaderAccountMenu = lazy(() => import('./HeaderAccountMenu'));
const HEADER_ACTION_MOTION_MS = 180;

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const reducedMotion = useReducedMotion();
    const { isLoggedIn } = useAuthStore();
    const currentPath = location.pathname.replace(/\/$/, '') || '/';
    const isDiscoveryRoot = isDiscoveryRootPath(location.pathname, location.search);
    const showBack = !isDiscoveryRoot;
    const goBack = useGoBack(currentPath === '/stores' || currentPath.startsWith('/store/') ? '/stores' : '/');
    const [navigationIntent, setNavigationIntent] = useState(null);
    const navigationTimerRef = useRef(null);
    const navigationStartRef = useRef(null);
    // 뒤로가기 버튼은 사라질 때도 나타날 때와 같은 접힘 모션을 탄다(2026-09-26).
    // 예전엔 ← 를 직접 눌렀을 때만 접혔고, 로고·하단 탭·브라우저 뒤로가기로 탐색 루트에 돌아갈 때는
    // 버튼이 그 자리에서 언마운트돼 RESERVE 로고가 48px 뚝 튀었다(사용자 지적).
    // 이제 showBack 이 꺼져도 모션 시간만큼 더 남겨 두고 같은 --leaving 애니메이션을 재생한다.
    // 로고 자체는 여전히 움직이지 않고 기다리지도 않는다 — 버튼 자리가 접히면서 로고가 따라 미끄러질 뿐이다.
    const { shouldRender: backMounted } = useExitAnimation(showBack, HEADER_ACTION_MOTION_MS);
    // 모션 최소화에서는 애니메이션이 꺼져 있으므로 남겨 둘 이유가 없다 — 즉시 나타나고 사라진다.
    const renderBack = reducedMotion ? showBack : backMounted;
    // 누른 직후(navigationIntent)와 경로가 바뀐 뒤 남아 있는 동안(renderBack && !showBack)을 같은 클래스로 묶는다.
    // 둘 사이에서 클래스가 한 번이라도 빠지면 애니메이션이 처음부터 다시 재생돼 버튼이 번쩍인다.
    const backLeaving = (navigationIntent?.intent === 'back' && navigationIntent.locationKey === location.key)
        || (renderBack && !showBack);
    const keyword = currentPath === '/stores' ? new URLSearchParams(location.search).get('keyword')?.trim() : '';
    const searchTarget = keyword ? '/search?keyword=' + encodeURIComponent(keyword) : '/search';

    useEffect(() => () => {
        if (navigationTimerRef.current) window.clearTimeout(navigationTimerRef.current);
        navigationTimerRef.current = null;
        navigationStartRef.current = null;
        // 같은 history key로 앞으로 돌아와도 완료된 이동의 잠금이 되살아나지 않는다.
        setNavigationIntent(null);
    }, [location.key]);

    // 메시지 패널은 자체 닫힘 모션을 끝낸 뒤 이동한다. 뒤로가기 버튼은 짧은 피드백 뒤 이동한다.
    // 로고는 모션 없이 바로 이동한다(handleLogoClick).
    const runHeaderNavigation = useCallback((intent, action) => {
        if (navigationStartRef.current === location.key) return;
        navigationStartRef.current = location.key;
        if (reducedMotion) {
            action();
            return;
        }

        setNavigationIntent({ intent, locationKey: location.key });
        navigationTimerRef.current = window.setTimeout(() => {
            navigationTimerRef.current = null;
            // POP 이동은 비동기다. 경로 커밋 전 intent를 풀면 enter → leave가 다시 재생된다.
            action();
        }, HEADER_ACTION_MOTION_MS);
    }, [reducedMotion, location.key]);

    const handleBack = () => {
        if (currentPath === '/messages' && requestMessengerRouteClose()) return;
        runHeaderNavigation('back', goBack);
    };

    // RESERVE 로고는 움직이지 않는다 — 눌림·축소·대기 없이 바로 이동한다(2026-09-21 사용자 결정:
    // "로고가 클릭되면서 안으로 들어가는 모션은 싫다, 로고는 정적이고 페이지만 움직이게").
    // 움직임은 도착한 홈 페이지가 맡는다. App의 공통 경로 전환이 방향을 받아 콘텐츠만 밀어 넣는다.
    // 홈에서 누르면 맨 위로 스크롤만 한다.
    const handleLogoClick = (e) => {
        e.preventDefault();
        if (location.pathname === '/') {
            window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
            return;
        }
        // 메시지 화면에서는 뒤로가기 버튼과 같이 닫힘 애니메이션을 먼저 재생하고 홈으로 간다.
        // 메시지 화면을 떠나는 이동에는 페이지 전환 슬라이드가 걸리지 않아 두 애니메이션이 겹치지 않는다.
        if (currentPath === '/messages' && requestMessengerRouteClose('/')) return;
        void navigate('/', { state: { reserveRouteMotion: 'from-left' } });
    };

    // 주의: 정지/영구정지 회원은 이제 로그인 자체가 차단되므로(이메일/소셜 공통)
    // 로그인된 상태에서 배너를 띄우는 분기는 더 이상 필요하지 않음 — 완전히 제거됨
    return (
        <header className={'reserve-header' + (keyword ? ' reserve-header-has-query' : '') + (!isLoggedIn ? ' reserve-header-is-guest' : '') + (showBack ? ' reserve-header-has-back' : '')} style={isDiscoveryRoot ? { ...styles.header, boxShadow: 'none' } : styles.header}>
            <div className="reserve-header-inner" style={styles.inner}>
                <div className="reserve-header-brand">
                    {renderBack && (
                        <button type="button" className={'reserve-header-back' + (backLeaving ? ' reserve-header-back--leaving' : '')}
                            onClick={handleBack} aria-label="이전 화면으로 돌아가기" disabled={backLeaving}
                            aria-hidden={showBack ? undefined : true}>
                            <ArrowLeftOutlined aria-hidden="true" />
                        </button>
                    )}
                    <a className="reserve-header-logo"
                        href="/" onClick={handleLogoClick} style={styles.logo} aria-label="RESERVE 홈">
                        <span className="reserve-header-logo-wordmark" aria-hidden="true">RESERVE</span>
                    </a>
                </div>
                {keyword && (
                    <Link to={searchTarget} state={{ searchEntry: true }} className="reserve-header-query" aria-label={'검색어 수정: ' + keyword} title={keyword}>
                        <SearchOutlined aria-hidden="true" />
                        <span className="reserve-header-query-text">{keyword}</span>
                    </Link>
                )}
                <div className="reserve-header-actions" style={styles.actions}>
                    {!keyword && (
                        <Link to={searchTarget} state={{ searchEntry: true }} className="reserve-header-search" aria-label="가게·지역·서비스 검색">
                            <SearchOutlined aria-hidden="true" />
                        </Link>
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
export function HeaderPlaceholder({ discoveryRoot = false }) {
    return (
        <div className="reserve-boot-shell-header" aria-hidden="true" style={discoveryRoot ? { ...styles.header, boxShadow: 'none' } : styles.header}>
            <div className="reserve-header-inner" style={styles.inner}>
                <div className="reserve-header-brand">
                    <span className="reserve-header-logo" style={{ color: styles.logo.color }}>
                        <span className="reserve-header-logo-wordmark">RESERVE</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
HeaderPlaceholder.propTypes = { discoveryRoot: PropTypes.bool };

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
    actionBtn: { borderRadius: radius.md, fontWeight: fontWeight.semibold, backgroundColor: colors.primary.main, border: 'none', height: heights.buttonMd, padding: '0 12px', whiteSpace: 'nowrap' },
    avatarFallback: { width: 36, height: 36, borderRadius: radius.full, background: colors.primary.light },
};

export default Header;
