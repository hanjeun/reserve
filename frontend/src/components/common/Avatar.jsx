/*
 * 출처가 바뀌면 오류를 초기화하고 사진이 없거나 실패할 때만 지정한 대체 노드를 표시한다.
 */
import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { UserOutlined } from './icons';
import { getImageUrl } from '../../utils/image';
import { colors } from '../../styles/tokens';
import LoadingImage from './LoadingImage';

const accountImageSource = src => (src?.startsWith('blob:') || src?.startsWith('data:')) ? src : getImageUrl(src, null);

const Avatar = ({ src, size = 36, style, draggable, referrerPolicy, fallback, resolveSource = accountImageSource }) => {
    const [imgError, setImgError] = useState(false);

    // src 변경 시 에러 상태 초기화
    useEffect(() => {
        if (imgError) setImgError(false); // eslint-disable-line react-hooks/set-state-in-effect
    }, [src]); // eslint-disable-line react-hooks/exhaustive-deps

    // blob: / data: URL은 그대로, 서버 상대경로만 절대경로로 변환
    // 소셜 로그인 시 https:// 시작하는 외부 URL이 올 수 있음 → getImageUrl이 그대로 반환
    const imgUrl = resolveSource(src, null);
    const showImg = imgUrl && !imgError;

    return (
        <div style={{
            width: size,
            height: size,
            borderRadius: '50%',
            backgroundColor: colors.primary.light,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
            position: 'relative',
            ...style,
        }}>
            {/* 기본 아이콘은 사진 뒤에 두고 지정한 대체 노드는 실패 뒤에 표시한다. */}
            {fallback === undefined ? <UserOutlined style={{
                fontSize: size * 0.44,
                color: colors.primary.main,
                position: 'absolute',
            }} /> : !showImg && fallback}
            {}
            {showImg && (
                <LoadingImage
                    src={imgUrl}
                    alt="프로필"
                    draggable={draggable}
                    referrerPolicy={referrerPolicy}
                    onError={() => setImgError(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                />
            )}
        </div>
    );
};

Avatar.propTypes = {
    src: PropTypes.string,
    size: PropTypes.number,
    style: PropTypes.object,
    draggable: PropTypes.bool,
    referrerPolicy: PropTypes.string,
    fallback: PropTypes.node,
    resolveSource: PropTypes.func,
};

export default Avatar;
