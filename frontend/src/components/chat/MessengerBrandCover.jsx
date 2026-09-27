import { useState } from 'react';
import PropTypes from 'prop-types';
import { getMessengerImageUrl, MESSENGER_COVER_IMAGE } from './messengerImages';

function CoverImage({ src }) {
    const [failed, setFailed] = useState(false);
    return failed ? null : <img className="reserve-messenger-cover-image" src={src} alt=""
        draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
CoverImage.propTypes = { src: PropTypes.string.isRequired };

export default function MessengerBrandCover({ imageSrc = MESSENGER_COVER_IMAGE, headingLevel = 2 }) {
    const Heading = `h${headingLevel}`;
    const source = getMessengerImageUrl(imageSrc, MESSENGER_COVER_IMAGE);
    return <header className="reserve-messenger-brand-cover">
        <CoverImage key={source} src={source} />
        <Heading id="reserve-messenger-home-title" className="reserve-messenger-sr-only">메시지</Heading>
    </header>;
}
MessengerBrandCover.propTypes = { imageSrc: PropTypes.string, headingLevel: PropTypes.oneOf([1, 2]) };
