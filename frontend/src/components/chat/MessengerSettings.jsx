import { useId, useState } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { UserOutlined } from '@ant-design/icons';
import { getMessengerImageUrl } from './messengerImages';
import ChatPreferences from './ChatPreferences';

function SettingsProfileImage({ source, initial }) {
    const [failed, setFailed] = useState(false);
    return source && !failed ? <img src={source} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initial || <UserOutlined />;
}

SettingsProfileImage.propTypes = { source: PropTypes.string, initial: PropTypes.string };

export default function MessengerSettings({ user, notificationControl, headingLevel = 2 }) {
    const titleId = useId();
    const environmentId = useId();
    const Heading = `h${headingLevel}`;
    const Subheading = `h${headingLevel + 1}`;
    const name = typeof user?.name === 'string' ? user.name.trim() : '';
    const email = typeof user?.email === 'string' ? user.email.trim() : '';
    const initial = Array.from(name)[0];
    const imageSource = getMessengerImageUrl(user?.profileImageUrl) || getMessengerImageUrl(user?.profileImage);
    const profileKey = JSON.stringify([user?.id ?? email, user?.role ?? null, imageSource]);

    return (
        <section className="reserve-messenger-settings" aria-labelledby={titleId}>
            <header className="reserve-messenger-settings-heading">
                <Heading id={titleId}>설정</Heading>
            </header>
            <div className="reserve-messenger-settings-scroll">
                <section className="reserve-messenger-settings-profile" aria-label="내 계정">
                    <span className="reserve-messenger-settings-avatar" aria-hidden="true">
                        <SettingsProfileImage key={profileKey} source={imageSource} initial={initial} />
                    </span>
                    <div className="reserve-messenger-settings-copy">
                        <strong className="reserve-messenger-settings-name">{name || '내 계정'}</strong>
                        {email && <p className="reserve-messenger-settings-email">{email}</p>}
                        <Link className="reserve-messenger-settings-link" to="/my-page">내 정보 관리</Link>
                    </div>
                </section>
                <section className="reserve-messenger-settings-environment" aria-labelledby={environmentId}>
                        <Subheading id={environmentId}>대화 환경</Subheading>
                        <ChatPreferences />
                        {notificationControl || null}
                </section>
            </div>
        </section>
    );
}

MessengerSettings.propTypes = {
    user: PropTypes.shape({ id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]), role: PropTypes.string, name: PropTypes.string, email: PropTypes.string, profileImage: PropTypes.string, profileImageUrl: PropTypes.string }),
    notificationControl: PropTypes.node,
    headingLevel: PropTypes.oneOf([1, 2]),
};
