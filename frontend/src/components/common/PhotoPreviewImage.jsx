import { useState } from 'react';
import PropTypes from 'prop-types';
import { Spin } from 'antd';
import LoadingStatus from './LoadingStatus';

export default function PhotoPreviewImage({ image }) {
    const [state, setState] = useState('loading');
    return <div className="reserve-photo-preview-image" ref={node => {
        const picture = node?.querySelector('img');
        if (picture?.complete) setState(picture.naturalWidth ? 'ready' : 'error');
    }} onLoadCapture={() => setState('ready')} onErrorCapture={() => setState('error')}>
        {image}
        {state === 'loading' && <LoadingStatus className="reserve-photo-preview-progress" aria-label="사진을 불러오는 중" aria-busy="true">
            <Spin size="large" />
        </LoadingStatus>}
        {state === 'error' && <div className="reserve-photo-preview-progress" role="status">사진을 불러오지 못했어요.</div>}
    </div>;
}

PhotoPreviewImage.propTypes = { image: PropTypes.element.isRequired };
