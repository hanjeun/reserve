import { Link, useLocation } from 'react-router-dom';
import { DISCOVERY_NAV_ITEMS } from '../../constants/discovery';

/** 주요 탐색 화면에만 남는 탭. 계정·예약·메시지는 프로필 메뉴에서 제공한다. */
export default function DiscoveryNav() {
    const { pathname } = useLocation();
    const currentPath = pathname.replace(/\/$/, '') || '/';

    return (
        <nav className="reserve-discovery-top-nav" aria-label="서비스 탐색">
            {DISCOVERY_NAV_ITEMS.map(item => (
                <Link key={item.to} to={item.to} aria-current={currentPath === item.to ? 'page' : undefined}>
                    {item.label}
                </Link>
            ))}
        </nav>
    );
}
