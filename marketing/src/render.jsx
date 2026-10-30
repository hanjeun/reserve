import { renderToStaticMarkup } from 'react-dom/server';
import Home, { homeAnimationStyles } from './home';
import Footer, { FOOTER_STYLES } from './Footer';
import { faqCollapseStyles } from './home/sections/FaqSection';
import Button from '../../frontend/src/components/common/Button';
import { LockOutlined, UserOutlined } from '../../frontend/src/components/common/icons';
import { colors, heights, fontWeight, radius } from '../../frontend/src/styles/tokens';

function Header() {
    return <header className="marketing-header" style={{
        backgroundColor: 'rgba(255, 255, 255, 0.9)', backdropFilter: 'blur(20px)', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', position: 'sticky',
        top: 0, zIndex: 1000, borderBottom: `1px solid ${colors.border.light}`, height: heights.header,
    }}>
        <a href="/" style={{ fontSize: 22, fontWeight: fontWeight.heavy, color: colors.primary.main,
            letterSpacing: '-0.8px', textDecoration: 'none' }}>RESERVE</a>
        <nav aria-label="계정" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Button variant="ghost" size="md" icon={<LockOutlined />} data-app-path="/login" style={{ fontWeight: fontWeight.semibold,
                borderRadius: radius.md, padding: '0 4px', whiteSpace: 'nowrap' }}>로그인</Button>
            <Button variant="primary" size="md" icon={<UserOutlined />} data-app-path="/signup" style={{ fontWeight: fontWeight.semibold,
                borderRadius: radius.md, padding: '0 12px', whiteSpace: 'nowrap' }}>회원가입</Button>
        </nav>
    </header>;
}

export function renderPage() {
    return {
        desktop: renderToStaticMarkup(<Home />),
        mobile: renderToStaticMarkup(<Home isMobile />),
        header: renderToStaticMarkup(<Header />),
        footer: renderToStaticMarkup(<Footer />),
        css: [homeAnimationStyles, faqCollapseStyles, FOOTER_STYLES].join('\n'),
    };
}
