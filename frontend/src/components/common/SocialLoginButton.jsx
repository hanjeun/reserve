import PropTypes from 'prop-types';
import { heights, radius } from '../../styles/tokens';

const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="#4285F4" d="M23.745 12.27c0-.79-.07-1.54-.19-2.27h-11.3v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
        <path fill="#34A853" d="M12.255 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96h-3.98v3.09C3.515 21.3 7.565 24 12.255 24z" />
        <path fill="#FBBC05" d="M5.525 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62h-3.98a11.86 11.86 0 000 10.76l3.98-3.09z" />
        <path fill="#EA4335" d="M12.255 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C18.205 1.19 15.495 0 12.255 0c-4.69 0-8.74 2.7-10.71 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z" />
    </svg>
);
const NaverIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M16.273 12.845L7.376 0H0v24h7.727V11.155L16.624 24H24V0h-7.727v12.845z" />
    </svg>
);
const KakaoIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path fill="#191919" d="M12 3C5.925 3 1 6.925 1 11.5c0 2.925 1.875 5.5 4.75 7.05l-.975 3.625c-.075.275.225.5.475.35l4.35-2.875c.775.125 1.575.2 2.4.2 6.075 0 11-3.925 11-8.75S18.075 3 12 3z" />
    </svg>
);

const providers = {
    google: { Icon: GoogleIcon, style: { backgroundColor: '#fff', border: '1px solid #dadce0' } },
    naver: { Icon: NaverIcon, style: { backgroundColor: '#03C75A', color: '#fff' } },
    kakao: { Icon: KakaoIcon, style: { backgroundColor: '#FEE500' } },
};
const circle = {
    width: heights.socialBtn, height: heights.socialBtn, flexShrink: 0, borderRadius: radius.full,
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', padding: 0,
};

export default function SocialLoginButton({ provider, label, disabled = false, onClick, ...props }) {
    const { Icon, style } = providers[provider];
    return <button {...props} type="button" className="reserve-social-login" aria-label={label}
        disabled={disabled} onClick={onClick}
        style={{ ...circle, ...style, ...(disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}) }}>
        <Icon />
    </button>;
}
SocialLoginButton.propTypes = {
    provider: PropTypes.oneOf(['google', 'naver', 'kakao']).isRequired,
    label: PropTypes.string.isRequired, disabled: PropTypes.bool, onClick: PropTypes.func,
};
