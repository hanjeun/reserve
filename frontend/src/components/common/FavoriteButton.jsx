import React, { useState, useEffect, useCallback } from 'react';
import { HeartOutlined, HeartFilled } from '@ant-design/icons';
import favoriteService from '../../services/favoriteService';
import useAuthStore from '../../store/useAuthStore';
import { useMessage } from '../../hooks';
import { colors } from '../../styles/tokens';

const FavoriteButton = ({ storeId, initialStatus, size = 'md', style = {} }) => {
    const { isLoggedIn } = useAuthStore();
    const { message } = useMessage();

    // 로그인하지 않은 사용자에게는 버튼을 보여주지 않음
    if (!isLoggedIn) {
        return null;
    }

    // initialStatus가 명시적으로 넘어오면 그걸 쓰고,
    // 없으면(undefined) API로 실제 상태 조회
    const [isFavorite, setIsFavorite] = useState(initialStatus ?? false);
    const [loading, setLoading] = useState(false);

    const iconSize = size === 'sm' ? 18 : 22;
    const btnSize  = size === 'sm' ? 36 : 44;

    // initialStatus가 없을 때만 서버에서 실제 상태 조회
    // 이미 로그인 체크를 컴포넌트 최상단에서 했으므로 여기서는 불필요
    useEffect(() => {
        if (initialStatus !== undefined) return; // 부모가 명시적으로 넘겨줬으면 스킵
        favoriteService.getStatus(storeId)
            .then(res => setIsFavorite(res?.isFavorite ?? res?.favorite ?? false))
            .catch(() => {});
    }, [storeId]); // eslint-disable-line

    const handleToggle = useCallback(async (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (loading) return;

        setLoading(true);
        setIsFavorite(prev => !prev); // 낙관적 업데이트

        try {
            const res = await favoriteService.toggle(storeId);
            // axios interceptor가 data 필드를 꺼내줌
            // Jackson이 boolean isFavorite → "favorite"로 직렬화하므로 둘 다 체크
            const added = res?.isFavorite ?? res?.favorite ?? !isFavorite;
            setIsFavorite(added);
            message.success(added ? '즐겨찾기에 추가되었습니다.' : '즐겨찾기에서 삭제되었습니다.');
        } catch {
            setIsFavorite(prev => !prev); // 실패 시 원복
            message.error('잠시 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
        }
    }, [storeId, loading, message]);

    return (
        <button
            type="button"
            onClick={handleToggle}
            disabled={loading}
            style={{
                width:          btnSize,
                height:         btnSize,
                borderRadius:   '50%',
                border:         'none',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                cursor:         loading ? 'not-allowed' : 'pointer',
                background:     'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(8px)',
                boxShadow:      '0 2px 8px rgba(0,0,0,0.12)',
                transition:     'transform 0.15s, box-shadow 0.15s',
                opacity:        loading ? 0.7 : 1,
                flexShrink:     0,
                ...style,
            }}
            title={isFavorite ? '즐겨찾기 삭제' : '즐겨찾기 추가'}
        >
            {isFavorite
                ? <HeartFilled  style={{ fontSize: iconSize, color: colors.error?.main || '#ff4d4f' }} />
                : <HeartOutlined style={{ fontSize: iconSize, color: colors.text.tertiary }} />
            }
        </button>
    );
};

export default FavoriteButton;
