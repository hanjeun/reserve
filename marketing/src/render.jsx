import { renderToStaticMarkup } from 'react-dom/server';
import Home, { homeAnimationStyles } from './home';
import Footer from './Footer';
import { faqCollapseStyles } from './home/sections/FaqSection';
import { LockOutlined, UserOutlined } from '../../frontend/src/components/common/icons';
import { colors, heights, fontWeight } from '../../frontend/src/styles/tokens';

function Header() {
    return <header className="marketing-header" style={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(20px)', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', position: 'sticky',
        top: 0, zIndex: 1000, borderBottom: `1px solid ${colors.border.light}`, height: heights.header,
    }}>
        <a href="/" data-scroll-top style={{ fontSize: 22, fontWeight: fontWeight.heavy, color: colors.primary.main,
            letterSpacing: '-0.8px', textDecoration: 'none' }}>RESERVE</a>
        <nav aria-label="계정" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a data-app-path="/login" className="reserve-header-search" aria-label="로그인" title="로그인"><LockOutlined aria-hidden /></a>
            <a data-app-path="/signup" className="reserve-header-search" aria-label="회원가입" title="회원가입"><UserOutlined aria-hidden /></a>
        </nav>
    </header>;
}

export function renderPage() {
    return {
        desktop: renderToStaticMarkup(<Home />),
        mobile: renderToStaticMarkup(<Home isMobile />),
        header: renderToStaticMarkup(<Header />),
        footer: renderToStaticMarkup(<Footer />),
        css: [`:root { --marketing-header-height: ${heights.header}; }`, homeAnimationStyles, faqCollapseStyles].join('\n'),
    };
}
