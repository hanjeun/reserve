import React from 'react';
import PropTypes from 'prop-types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HeartOutlined, HeartFilled } from '@ant-design/icons';
import favoriteService from '../../services/favoriteService';
import useAuthStore from '../../store/useAuthStore';
import { useMessage } from '../../hooks';
import { favoriteKeys } from '../../hooks/queryKeys';
import { colors } from '../../styles/tokens';

/**
 * 2026-07-09: TanStack Query로 전환 (favoriteKeys.status(storeId)) — initialStatus가 없을 때
 * 각 카드가 개별적으로 조회하던 걸 캐시로 묶어서, 같은 가게가 여러 곳(목록+상세 등)에 동시에
 * 떠 있어도 한 번만 조회하고 토글 시 전부 같이 갱신된다.
 */
const FavoriteButton = ({ storeId, initialStatus, size = 'md', style = {} }) => {
    const { isLoggedIn } = useAuthStore();
    const { message } = useMessage();
    const queryClient = useQueryClient();

    const iconSize = size === 'sm' ? 18 : 22;
    const btnSize  = size === 'sm' ? 36 : 44;

    // initialStatus가 주어지면 그 값으로 캐시를 미리 채워두고(자체 조회 스킵), 없으면 직접 조회
    const { data: isFavorite = initialStatus ?? false } = useQuery({
        queryKey: favoriteKeys.status(storeId),
        queryFn: async () => {
            const res = await favoriteService.getStatus(storeId);
            return res?.isFavorite ?? res?.favorite ?? false;
        },
        enabled: isLoggedIn && initialStatus === undefined,
        initialData: initialStatus,
    });

    const toggleMutation = useMutation({
        mutationFn: () => favoriteService.toggle(storeId),
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: favoriteKeys.status(storeId) });
            const prev = queryClient.getQueryData(favoriteKeys.status(storeId));
            queryClient.setQueryData(favoriteKeys.status(storeId), (old) => !old);
            return { prev };
        },
        onSuccess: (res) => {
            const added = res?.isFavorite ?? res?.favorite;
            queryClient.setQueryData(favoriteKeys.status(storeId), added);
            message.success(added ? '즐겨찾기에 추가되었습니다.' : '즐겨찾기에서 삭제되었습니다.');
        },
        onError: (_err, _vars, ctx) => {
            queryClient.setQueryData(favoriteKeys.status(storeId), ctx?.prev);
            message.error('잠시 후 다시 시도해주세요.');
        },
    });

    const handleToggle = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (toggleMutation.isPending) return;
        toggleMutation.mutate();
    };

    // 로그인하지 않은 사용자에게는 버튼 미표시
    if (!isLoggedIn) return null;

    return (
        <button
            type="button"
            onClick={handleToggle}
            disabled={toggleMutation.isPending}
            style={{
                width:          btnSize,
                height:         btnSize,
                borderRadius:   '50%',
                border:         'none',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                cursor:         toggleMutation.isPending ? 'not-allowed' : 'pointer',
                background:     'rgba(255,255,255,0.92)',
                backdropFilter: 'blur(8px)',
                boxShadow:      '0 2px 8px rgba(0,0,0,0.12)',
                transition:     'transform 0.15s, box-shadow 0.15s',
                // 응답 대기 중 opacity를 낮추지 않는다. onMutate의 낙관적 업데이트로 하트는 이미
                // 즉시 채워지는데, 버튼 전체가 반투명해지면 그 빨강이 "덜 진한 빨강"으로 보이다가
                // 응답이 와서(=성공 메시지가 뜰 때) 비로소 제 색이 되는 것처럼 느껴진다.
                // 낙관적 업데이트의 목적(즉각 반응)과 정면으로 어긋나므로 제거. 중복 클릭은 disabled가 막는다.
                flexShrink:     0,
                ...style,
            }}
            title={isFavorite ? '즐겨찾기 삭제' : '즐겨찾기 추가'}
        >
            {isFavorite
                ? <HeartFilled  style={{ fontSize: iconSize, color: colors.error.main }} />
                : <HeartOutlined style={{ fontSize: iconSize, color: colors.text.tertiary }} />
            }
        </button>
    );
};

FavoriteButton.propTypes = {
    storeId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    initialStatus: PropTypes.bool,
    size: PropTypes.oneOf(['sm', 'md']),
    style: PropTypes.object,
};

export default FavoriteButton;
