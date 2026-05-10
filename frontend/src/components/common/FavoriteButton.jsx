import React, { useState, useEffect, useCallback } from 'react';
import { HeartOutlined, HeartFilled } from '@ant-design/icons';
import favoriteService from '../../services/favoriteService';
import useAuthStore from '../../store/useAuthStore';
import { useMessage } from '../../hooks';
import { colors } from '../../styles/tokens';

const FavoriteButton = ({ storeId, initialStatus, size = 'md', style = {} }) => {
    const { isLoggedIn } = useAuthStore();
    const { message } = useMessage();

    // NOTE: Hook은 항상 최상단 — 조건부 return 전에 선언
    const [isFavorite, setIsFavorite] = useState(initialStatus ?? false);
    const [loading, setLoading]       = useState(false);

    const iconSize = size === 'sm' ? 18 : 22;
    const btnSize  = size === 'sm' ? 36 : 44;

    useEffect(() => {
        if (!isLoggedIn) return;
        if (initialStatus !== undefined) return;
        favoriteService.getStatus(storeId)
            .then(res => setIsFavorite(res?.isFavorite ?? res?.favorite ?? false))
            .catch(() => {});
    }, [storeId, isLoggedIn, initialStatus]);

    const handleToggle = useCallback(async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (loading) return;

        setLoading(true);
        setIsFavorite(prev => !prev);

        try {
            const res = await favoriteService.toggle(storeId);
            const added = res?.isFavorite ?? res?.favorite ?? !isFavorite;
            setIsFavorite(added);
            message.success(added ? '즐겨찾기에 추가되었습니다.' : '즐겨찾기에서 삭제되었습니다.');
        } catch {
            setIsFavorite(prev => !prev);
            message.error('잠시 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
        }
    }, [storeId, loading, isFavorite, message]);

    // 로그인하지 않은 사용자에게는 버튼 미표시
    if (!isLoggedIn) return null;

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
