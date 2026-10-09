import PropTypes from 'prop-types';
import { SERVICE_DOMAIN_IMAGES } from '../../constants/discovery';

/** The same hashed 3D asset is used in discovery, search and store setup. */
export default function ServiceDomainIcon({ domain, size = 56 }) {
    const image = SERVICE_DOMAIN_IMAGES[domain];
    if (!image) return null;
    return <img className="reserve-service-domain-icon" src={image.src}
        sizes={`${size}px`} alt="" width={size} height={size} draggable={false} decoding="async"
        style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />;
}
ServiceDomainIcon.propTypes = { domain: PropTypes.string.isRequired, size: PropTypes.number };
