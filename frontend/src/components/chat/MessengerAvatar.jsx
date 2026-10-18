import PropTypes from 'prop-types';
import { CustomerServiceOutlined, ShopOutlined, UserOutlined } from '../common/icons';
import { getMessengerImageUrl, MESSENGER_BRAND_AVATAR } from './messengerImages';
import Avatar from '../common/Avatar';

const avatarStyle = { width: '100%', height: '100%', backgroundColor: 'transparent', color: 'inherit', fontSize: 'inherit' };

function AvatarImage({ src, variant }) {
    let fallback;
    if (variant === 'store') fallback = <ShopOutlined />;
    else if (variant === 'person') fallback = <UserOutlined />;
    else if (src === MESSENGER_BRAND_AVATAR) fallback = <CustomerServiceOutlined />;
    else fallback = <Avatar src={MESSENGER_BRAND_AVATAR} size={40} style={avatarStyle} draggable={false}
        referrerPolicy="no-referrer" resolveSource={getMessengerImageUrl} fallback={<CustomerServiceOutlined />} />;
    return <Avatar src={src} size={40} style={avatarStyle} draggable={false}
        referrerPolicy="no-referrer" resolveSource={getMessengerImageUrl} fallback={fallback} />;
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
