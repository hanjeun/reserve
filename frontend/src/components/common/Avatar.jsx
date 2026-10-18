/**
 * RESERVE - 공통 Avatar 컴포넌트
 *
 * - 기본 fallback은 하늘색 배경 + 파란 아이콘
 * - fallback 노드를 지정하면 사진이 없거나 실패했을 때만 표시
 * - src 변경 시 imgError 자동 초기화
 * - 레이어 방식: 아이콘이 항상 뒤에, 이미지가 위에 덮음
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
            {/* 기본 아이콘은 이미지 뒤에 유지하고, 별도 fallback은 실패한 뒤에만 렌더 */}
            {fallback === undefined ? <UserOutlined style={{
                fontSize: size * 0.44,
                color: colors.primary.main,
                position: 'absolute',
            }} /> : !showImg && fallback}
            {/* 이미지 — 로드 성공 시 아이콘 위에 덮음, 실패 시 아이콘 노출 */}
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
