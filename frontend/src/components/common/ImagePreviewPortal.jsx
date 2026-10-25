import React from 'react';
import PropTypes from 'prop-types';
import { Image } from 'antd';

/*
 * 컴포넌트 타입을 모듈 수준에 고정해 재마운트 없이 props로 현재 값을 전달한다.
 */
const ImagePreviewPortal = ({ open, items, current, sessionKey, onClose, onCurrentChange }) => {
    // items가 비워지는 시점이 닫힘 애니메이션 이후로 미뤄져 있어서, 이 early return이 애니메이션을 자르지 않는다.
    if (items.length === 0) return null;

    return (
        <Image.PreviewGroup
            /*
             * 퇴장 중인 DOM과 새 미리보기가 모션을 공유하지 않도록 세션별 인스턴스를 사용한다.
             */
            key={sessionKey}
            items={items}
            preview={{
                visible: open,
                onVisibleChange: (visible) => { if (!visible) onClose(); },
                current,
                /*
                 * 제어된 사진 인덱스를 onChange로 갱신해 사용자 넘김을 유지한다.
                 */
                onChange: onCurrentChange,
                /*
                 * 미리보기 루트의 공통 도구 스타일은 rootClassName에 연결한다.
                 */
                rootClassName: 'reserve-image-preview',
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
};

export default ImagePreviewPortal;
