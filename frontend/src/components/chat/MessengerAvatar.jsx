import { useState } from 'react';
import PropTypes from 'prop-types';
import { CustomerServiceOutlined, ShopOutlined, UserOutlined } from '@ant-design/icons';
import { getMessengerImageUrl, MESSENGER_BRAND_AVATAR } from './messengerImages';

function AvatarImage({ src, variant }) {
    const [failed, setFailed] = useState(false);
    const [brandFailed, setBrandFailed] = useState(false);
    if (variant === 'store' && (failed || !src)) return <ShopOutlined />;
    if (variant === 'person' && (failed || !src)) return <UserOutlined />;
    if (brandFailed) return <CustomerServiceOutlined />;
    return <img src={failed ? MESSENGER_BRAND_AVATAR : src} alt="" draggable={false}
        referrerPolicy="no-referrer" onError={() => failed || src === MESSENGER_BRAND_AVATAR ? setBrandFailed(true) : setFailed(true)} />;
}
AvatarImage.propTypes = { src: PropTypes.string, variant: PropTypes.oneOf(['brand', 'store', 'person']).isRequired };

export default function MessengerAvatar({ imageSrc = null, className = '', variant = 'brand' }) {
    const source = getMessengerImageUrl(imageSrc, variant === 'brand' ? MESSENGER_BRAND_AVATAR : null);
    const modifier = variant === 'brand' ? '' : ` reserve-messenger-avatar--${variant}`;
    return <span className={`reserve-messenger-avatar${modifier} ${className}`.trim()} aria-hidden="true">
        <AvatarImage key={source} src={source} variant={variant} />
    </span>;
}
MessengerAvatar.propTypes = { imageSrc: PropTypes.string, className: PropTypes.string, variant: PropTypes.oneOf(['brand', 'store', 'person']) };
