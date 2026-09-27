import PropTypes from 'prop-types';
import { SendOutlined } from '@ant-design/icons';
import MessengerBrandCover from './MessengerBrandCover';
import { SupportAvatar, SupportName } from './SupportIdentity';

export default function MessengerHome({ onChoose, coverImageSrc, headingLevel = 2, admin = false }) {
    return (
        <section className="reserve-messenger-home" aria-labelledby="reserve-messenger-home-title">
            <MessengerBrandCover imageSrc={coverImageSrc} headingLevel={headingLevel} />
            <div className="reserve-messenger-home-scroll">
                <section className="reserve-messenger-welcome" aria-label="고객지원 문의 안내">
                    <div className="reserve-messenger-welcome-sender">
                        <SupportAvatar />
                        <strong><SupportName /></strong>
                    </div>
                    <p>{admin ? '접수된 고객 문의를 확인하고 답변해주세요.' : '안녕하세요. 궁금한 점을 남겨주세요.'}</p>
                    <button type="button" className="reserve-messenger-primary-action" onClick={() => onChoose({ kind: admin ? 'admin-inbox' : 'support' })}>
                        {admin ? '고객 문의 확인' : '고객지원에 문의'} <SendOutlined aria-hidden="true" />
                    </button>
                </section>
            </div>
        </section>
    );
}

MessengerHome.propTypes = {
    coverImageSrc: PropTypes.string,
    onChoose: PropTypes.func.isRequired,
    headingLevel: PropTypes.oneOf([1, 2]),
    admin: PropTypes.bool,
};
