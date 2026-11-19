import React from 'react';
import PropTypes from 'prop-types';
import { Image } from 'antd';
import PhotoPreviewImage from './PhotoPreviewImage';

/*
 * 컴포넌트 타입을 모듈 수준에 고정해 재마운트 없이 props로 현재 값을 전달한다.
 */
const ImagePreviewPortal = ({ open, items, current, sessionKey, onClose, onCurrentChange, showImageLoading }) => {
    // items가 비워지는 시점이 닫힘 애니메이션 이후로 미뤄져 있어서, 이 early return이 애니메이션을 자르지 않는다.
    if (items.length === 0) return null;

    return (
        <Image.PreviewGroup
            /*
             * 퇴장 중인 DOM과 새 미리보기가 모션을 공유하지 않도록 세션별 인스턴스를 사용한다.
             */
            key={sessionKey}
            items={items}
            classNames={{ popup: { root: 'reserve-image-preview' } }}
            preview={{
                open,
                onOpenChange: (visible) => { if (!visible) onClose(); },
                current,
                /*
                 * 제어된 사진 인덱스를 onChange로 갱신해 사용자 넘김을 유지한다.
                 */
                onChange: onCurrentChange,
                imageRender: showImageLoading ? image => <PhotoPreviewImage key={image.props.src} image={image} /> : undefined,
            }}
        />
    );
};

ImagePreviewPortal.propTypes = {
    open: PropTypes.bool.isRequired,
    items: PropTypes.array.isRequired,
    current: PropTypes.number.isRequired,
    sessionKey: PropTypes.number.isRequired,
    onClose: PropTypes.func.isRequired,
    onCurrentChange: PropTypes.func.isRequired,
    showImageLoading: PropTypes.bool,
};

export default ImagePreviewPortal;
