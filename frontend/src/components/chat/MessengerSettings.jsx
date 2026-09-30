import { useId } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import Avatar from '../common/Avatar';
import { getMessengerImageUrl } from './messengerImages';
import ChatPreferences from './ChatPreferences';

export default function MessengerSettings({ user, notificationControl, headingLevel = 2 }) {
    const titleId = useId();
    const environmentId = useId();
    const Heading = `h${headingLevel}`;
    const Subheading = `h${headingLevel + 1}`;
    const name = typeof user?.name === 'string' ? user.name.trim() : '';
    const email = typeof user?.email === 'string' ? user.email.trim() : '';
    const imageSource = getMessengerImageUrl(user?.profileImageUrl) || getMessengerImageUrl(user?.profileImage);
    // URL 검증은 유지하되, 사진의 크롭·중앙 정렬·실패 처리는 마이페이지 Avatar가 소유한다.
    // /icons 같은 프론트 자산을 업로드 API 경로로 다시 변환하지 않도록 절대 주소로 전달한다.
    const profileSource = imageSource ? new URL(imageSource, window.location.origin).href : null;
    const profileKey = JSON.stringify([user?.id ?? email, user?.role ?? null, imageSource]);

    return (
        <section className="reserve-messenger-settings" aria-labelledby={titleId}>
            <header className="reserve-messenger-settings-heading">
                <Heading id={titleId}>설정</Heading>
            </header>
            <div className="reserve-messenger-settings-scroll">
                <section className="reserve-messenger-settings-profile" aria-label="내 계정">
                    <div className="reserve-messenger-settings-avatar" aria-hidden="true">
                        <Avatar key={profileKey} src={profileSource} size={64} draggable={false} referrerPolicy="no-referrer" />
                    </div>
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
