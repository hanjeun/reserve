import { Link, useLocation } from 'react-router-dom';
import { APP_ORIGIN, LEGACY_ORIGIN, appUrl } from '../../config/siteUrls';

export default function LegacyDomainNotice() {
    const location = useLocation();
    if (APP_ORIGIN === LEGACY_ORIGIN || window.location.origin !== LEGACY_ORIGIN || location.pathname === '/messages') return null;
    const destination = /^\/oauth2\//.test(location.pathname) ? '/login' : `${location.pathname}${location.search}${location.hash}`;
    return <aside className="reserve-legacy-domain-notice" aria-label="새 앱 주소 안내"><span>앱 주소가 바뀌었어요. 새 주소에서는 다시 로그인해주세요.</span>
        <a href={appUrl(destination)}>새 앱으로 이동</a><Link to="/drafts/transfer">가게 초안 옮기기</Link></aside>;
}
