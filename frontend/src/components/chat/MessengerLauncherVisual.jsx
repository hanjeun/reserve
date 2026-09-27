import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { CloseOutlined, MessageOutlined } from '@ant-design/icons';

const LauncherImage = ({ src }) => {
    const [failed, setFailed] = useState(false);
    if (failed) return <MessageOutlined aria-hidden="true" />;
    return (
        <img
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

// 인증·배지·열기/닫기는 Shell의 책임. 시각 요소만 사진으로 교체한다.
const MessengerLauncherVisual = ({ isOpen, imageSrc = null }) => {
    if (isOpen) return <CloseOutlined aria-hidden="true" />;
    // src가 바뀌면 key로 이전 이미지의 로드 실패 상태도 새로 시작한다.
    if (imageSrc) return <LauncherImage key={imageSrc} src={imageSrc} />;
    return <MessageOutlined aria-hidden="true" />;
};

MessengerLauncherVisual.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    imageSrc: PropTypes.string,
};

export default MessengerLauncherVisual;
