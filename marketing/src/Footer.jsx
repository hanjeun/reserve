import FooterContent from '../../frontend/src/components/layout/FooterContent';
import { appUrl } from './navigation';

const renderLink = (path, label) => <a href={appUrl(path)} className="reserve-app-footer-link reserve-text-link">{label}</a>;

export default function MarketingFooter() {
    return <FooterContent renderLink={renderLink} brandHref="/" />;
}
