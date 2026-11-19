import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { CloseOutlined, MessageOutlined } from '../common/icons';
import LoadingImage from '../common/LoadingImage';

const LauncherImage = ({ src }) => {
    const [failed, setFailed] = useState(false);
    if (failed) return <MessageOutlined aria-hidden="true" />;
    return (
        <LoadingImage
            className="reserve-messenger-launcher-image"
            src={src}
            alt=""
            aria-hidden="true"
            draggable={false}
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
        />
    );
};
LauncherImage.propTypes = { src: PropTypes.string.isRequired };

const MessengerLauncherVisual = ({ isOpen, imageSrc = null }) => {
    if (isOpen) return <CloseOutlined aria-hidden="true" />;
    // 사진 출처가 바뀌면 이전 로딩 오류 상태를 폐기한다.
    if (imageSrc) return <LauncherImage key={imageSrc} src={imageSrc} />;
    // 파비콘의 R 윤곽만 사용하고 면과 색은 테마가 정한다.
    return <svg className="reserve-messenger-launcher-mark" aria-hidden="true" focusable="false"
        viewBox="0 0 512 512" fill="currentColor">
        <path d="M128.266 87.625H267.016C292.328 87.625 314.203 92.1562 332.641 101.219C351.234 110.281 365.453 123.328 375.297 140.359C385.297 157.234 390.297 177.156 390.297 200.125C390.297 223.25 385.219 243.094 375.062 259.656C365.062 276.219 350.609 288.797 331.703 297.391L402.484 427H314.828L252.484 310.281H207.953V427H128.266V87.625ZM250.141 246.531C288.578 246.531 307.797 231.062 307.797 200.125C307.797 184.344 302.875 172.469 293.031 164.5C283.344 156.375 269.047 152.312 250.141 152.312H207.953V246.531H250.141Z" />
    </svg>;
};

MessengerLauncherVisual.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    imageSrc: PropTypes.string,
};

export default MessengerLauncherVisual;
