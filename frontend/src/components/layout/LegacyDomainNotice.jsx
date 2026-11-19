import { useLocation } from 'react-router-dom';
import TextLink from '../common/TextLink';
import { APP_ORIGIN, isLegacyAppOrigin } from '../../config/siteUrls';

export default function LegacyDomainNotice() {
    const { pathname, search, hash } = useLocation();
    if (!isLegacyAppOrigin() || ['/messages', '/login', '/login/'].includes(pathname)) return null;
    const destination = pathname.startsWith('/oauth2/') ? '/login' : pathname + search + hash;
    return <aside className="reserve-legacy-domain-notice" aria-label="새 앱 주소 안내">
        <span>앱 주소가 바뀌었어요. 새 주소에서는 다시 로그인해주세요.</span>
        <TextLink href={APP_ORIGIN + destination}>새 앱으로 이동</TextLink>
    </aside>;
}
