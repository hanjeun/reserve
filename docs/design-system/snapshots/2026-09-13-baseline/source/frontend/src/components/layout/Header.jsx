import React, { lazy, Suspense } from 'react';
import { ArrowLeftOutlined, SearchOutlined } from '@ant-design/icons';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import useReducedMotion from '../../hooks/useReducedMotion';
import useGoBack from '../../hooks/useGoBack';
import { isDiscoveryRootPath } from '../../constants/discovery';
import { colors, heights, radius } from '../../styles/tokens';

const HeaderAccountMenu = lazy(() => import('./HeaderAccountMenu'));

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const reducedMotion = useReducedMotion();
    const currentPath = location.pathname.replace(/\/$/, '') || '/';
    const showBack = !isDiscoveryRootPath(location.pathname, location.search);
    const goBack = useGoBack(currentPath === '/stores' || currentPath.startsWith('/store/') ? '/stores' : '/');
    const keyword = currentPath === '/stores' ? new URLSearchParams(location.search).get('keyword')?.trim() : '';
    const searchTarget = keyword ? '/search?keyword=' + encodeURIComponent(keyword) : '/search';

    // RESERVE 로고 클릭: 홈이면 맨 위로 스크롤, 아니면 홈으로 이동
    const handleLogoClick = (e) => {
        e.preventDefault();

        if (location.pathname === '/') {
            window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
        } else {
            navigate('/');
        }
    };

    // 주의: 정지/영구정지 회원은 이제 로그인 자체가 차단되므로(이메일/소셜 공통)
    // 로그인된 상태에서 배너를 띄우는 분기는 더 이상 필요하지 않음 — 완전히 제거됨
    return (
        <header className="reserve-header" style={styles.header}>
            <div className="reserve-header-inner" style={styles.inner}>
                <div className="reserve-header-brand">
                    {showBack && (
                        <button type="button" className="reserve-header-back" onClick={goBack} aria-label="이전 화면으로 돌아가기">
                            <ArrowLeftOutlined aria-hidden="true" />
                        </button>
                    )}
                    <a className={'reserve-header-logo' + (showBack ? ' reserve-header-logo--secondary' : '')} href="/" onClick={handleLogoClick} style={styles.logo} aria-label="RESERVE 홈">
                        <img src="/icons/R_logo.png" alt="" width={44} height={44} />
                        <span className="reserve-header-logo-wordmark" aria-hidden="true">RESERVE</span>
                    </a>
                </div>
                <Link to={searchTarget} state={{ searchEntry: true }} className={'reserve-header-search' + (keyword ? ' reserve-header-search--filled' : '')} aria-label="가게·지역·서비스 검색">
                    <SearchOutlined aria-hidden="true" />
                    <span className="reserve-header-search-label">{keyword || '가게·지역·서비스 검색'}</span>
                </Link>
                <div className="reserve-header-actions" style={styles.actions}>
                    <Suspense fallback={<span className="reserve-header-account-loading" aria-hidden="true" style={styles.avatarFallback} />}>
                        <HeaderAccountMenu />
                    </Suspense>
                </div>
            </div>
        </header>
    );
};

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
        borderBottom: `1px solid ${colors.border.light}`,
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
    avatarFallback: { width: 36, height: 36, borderRadius: radius.full, background: colors.primary.light },
};

export default Header;
