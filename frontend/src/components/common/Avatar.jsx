/**
 * RESERVE - 공통 Avatar 컴포넌트
 *
 * - src 로드 실패 시 항상 하늘색 배경 + 파란 아이콘으로 fallback
 * - src 변경 시 imgError 자동 초기화
 * - 레이어 방식: 아이콘이 항상 뒤에, 이미지가 위에 덮음
 */
import React, { useState, useRef } from 'react';
import { UserOutlined } from '@ant-design/icons';
import { getImageUrl } from '../../utils/image';
import { colors } from '../../styles/tokens';

const Avatar = ({ src, size = 36, style }) => {
    const [imgError, setImgError] = useState(false);
    const prevSrc = useRef(src);
    if (prevSrc.current !== src) {
        prevSrc.current = src;
        if (imgError) setImgError(false);
    }

    // blob: / data: URL은 그대로, 서버 상대경로만 절대경로로 변환
    const imgUrl = (src?.startsWith('blob:') || src?.startsWith('data:')) ? src : getImageUrl(src, null);
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
            {/* 기본 아이콘 — 항상 뒤에 렌더 */}
            <UserOutlined style={{
                fontSize: size * 0.44,
                color: colors.primary.main,
                position: 'absolute',
            }} />
            {/* 이미지 — 로드 성공 시 아이콘 위에 덮음, 실패 시 아이콘 노출 */}
            {showImg && (
                <img
                    src={imgUrl}
                    alt="프로필"
                    onError={() => setImgError(true)}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }}
                />
            )}
        </div>
    );
};

export default Avatar;
