import React, { lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import Button from '../common/Button';
import { colors, heights, fontWeight, radius } from '../../styles/tokens';

const HeaderAccountMenu = lazy(() => import('./HeaderAccountMenu'));

const Header = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { isLoggedIn } = useAuthStore();

    // RESERVE 로고 클릭: 홈이면 맨 위로 스크롤, 아니면 홈으로 이동
    const handleLogoClick = (e) => {
        e.preventDefault();

        if (location.pathname === '/') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            navigate('/');
        }
    };

    // 주의: 정지/영구정지 회원은 이제 로그인 자체가 차단되므로(이메일/소셜 공통)
    // 로그인된 상태에서 배너를 띄우는 분기는 더 이상 필요하지 않음 — 완전히 제거됨
    return (
        <header style={styles.header}>
            <a href="/" onClick={handleLogoClick} style={styles.logo}>RESERVE</a>
            <div style={styles.actions}>
                {isLoggedIn ? (
                    <Suspense fallback={<span aria-hidden="true" style={styles.avatarFallback} />}>
                        <HeaderAccountMenu />
                    </Suspense>
                ) : (
                    <div style={styles.guestActions}>
                        <Button variant="ghost" size="md" onClick={() => navigate('/login')} style={styles.navBtn}>로그인</Button>
                        <Button variant="primary" size="md" onClick={() => navigate('/signup')} style={styles.actionBtn}>시작하기</Button>
                    </div>
                )}
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
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        borderBottom: `1px solid ${colors.border.light}`,
        height: heights.header,
        width: '100%',
        boxSizing: 'border-box',
    },
    logo: {
        fontSize: 22,
        fontWeight: fontWeight.heavy,
        fontFamily: '"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, sans-serif',
        color: colors.primary.main,
        letterSpacing: '-0.8px',
        textDecoration: 'none',
        cursor: 'pointer',
    },
    actions: { display: 'flex', alignItems: 'center' },
    guestActions: { display: 'flex', alignItems: 'center', gap: 8 },
    avatarFallback: { width: 36, height: 36, borderRadius: '50%', background: colors.primary.light },
    navBtn: { color: colors.text.secondary, fontWeight: fontWeight.semibold, borderRadius: radius.md, height: heights.buttonMd, border: 'none' },
    actionBtn: { borderRadius: radius.md, fontWeight: fontWeight.semibold, backgroundColor: colors.primary.main, border: 'none', height: heights.buttonMd, padding: '0 20px' },
};

export default Header;
