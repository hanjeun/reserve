import React from 'react';
import PropTypes from 'prop-types';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { HeartOutlined, HeartFilled } from '@ant-design/icons';
import favoriteService from '../../services/favoriteService';
import useAuthStore from '../../store/useAuthStore';
import useMessage from '../../hooks/useMessage';
import { favoriteKeys } from '../../hooks/queryKeys';
import { invalidateFavoriteData } from '../../hooks/invalidateAfterWrite';
import { colors } from '../../styles/tokens';

const toggleSuccessMessage = (added) => (added ? '즐겨찾기에 추가됐어요.' : '즐겨찾기에서 삭제됐어요.');

// 낙관적 업데이트 + 실패 시 되돌리기
function useFavoriteToggle(storeId, queryClient, message) {
    return useMutation({
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
            // 하트만 바꾸면 '내 즐겨찾기' 목록은 staleTime(3분) 동안 옛 목록이 남는다.
            void invalidateFavoriteData(queryClient);
            message.success(toggleSuccessMessage(added));
        },
        onError: (_err, _vars, ctx) => {
            queryClient.setQueryData(favoriteKeys.status(storeId), ctx?.prev);
            message.error('잠시 후 다시 시도해주세요.');
        },
    });
}

function getAccessibleLabel(statusUnknown, statusFailed, isFavorite) {
    if (!statusUnknown) return isFavorite ? '즐겨찾기 삭제' : '즐겨찾기 추가';
    if (statusFailed) return '즐겨찾기 상태를 확인하지 못했어요. 눌러서 다시 확인';
    return '즐겨찾기 상태 확인 중';
}

const favoriteClassName = (plain, modifier = '') =>
    `reserve-favorite-button${modifier}${plain ? ' reserve-favorite-button--plain' : ''}`;

// 광고 미리보기(preview): 실제 목록과 같은 자리·모양의 빈 하트만 그린다(2026-09-23).
// 누를 수 없는 그림이라 button 이 아니고 조회도 하지 않는다 — 미리보기 안에는 링크·버튼이 없어야 한다.
function FavoritePreview({ plain, btnSize, iconSize, style }) {
    return (
        <span
            aria-hidden="true"
            className={favoriteClassName(plain, ' reserve-favorite-button--preview')}
            style={{
                width:          btnSize,
                height:         btnSize,
                borderRadius:   plain ? 0 : '50%',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'center',
                background:     plain ? 'transparent' : 'rgba(255,255,255,0.92)',
                boxShadow:      plain ? 'none' : '0 2px 8px rgba(0,0,0,0.12)',
                pointerEvents:  'none',
                flexShrink:     0,
                ...style,
            }}
        >
            <HeartOutlined style={{ fontSize: iconSize, color: colors.text.tertiary }} />
        </span>
    );
}

FavoritePreview.propTypes = {
    plain: PropTypes.bool,
    btnSize: PropTypes.number,
    iconSize: PropTypes.number,
    style: PropTypes.object,
};

function buildButtonStyle({ plain, btnSize, blocked, statusUnknown, style }) {
    return {
        width:          btnSize,
        height:         btnSize,
        borderRadius:   plain ? 0 : '50%',
        border:         'none',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        cursor:         blocked ? 'not-allowed' : 'pointer',
        opacity:        statusUnknown ? 0.55 : 1,
        background:     plain ? 'transparent' : 'rgba(255,255,255,0.92)',
        backdropFilter: plain ? 'none' : 'blur(8px)',
        boxShadow:      plain ? 'none' : '0 2px 8px rgba(0,0,0,0.12)',
        transition:     plain ? 'transform 0.15s' : 'transform 0.15s, box-shadow 0.15s',
        // 응답 대기 중 opacity를 낮추지 않는다. onMutate의 낙관적 업데이트로 하트는 이미
        // 즉시 채워지는데, 버튼 전체가 반투명해지면 그 빨강이 "덜 진한 빨강"으로 보이다가
        // 응답이 와서(=성공 메시지가 뜰 때) 비로소 제 색이 되는 것처럼 느껴진다.
        // 낙관적 업데이트의 목적(즉각 반응)과 정면으로 어긋나므로 제거. 중복 클릭은 disabled가 막는다.
        flexShrink:     0,
        ...style,
    };
}

/**
 * 2026-07-09: TanStack Query로 전환 (favoriteKeys.status(storeId)) — initialStatus가 없을 때
 * 각 카드가 개별적으로 조회하던 걸 캐시로 묶어서, 같은 가게가 여러 곳(목록+상세 등)에 동시에
 * 떠 있어도 한 번만 조회하고 토글 시 전부 같이 갱신된다.
 */
const FavoriteButton = ({ storeId, initialStatus, size = 'md', appearance = 'overlay', style = {}, preview = false }) => {
    // 필요한 값만 구독한다 — 스토어 전체를 구독하면 목록의 하트 수십 개가 로그인 정보가 바뀔 때마다 다시 그려진다.
    const isLoggedIn = useAuthStore(state => state.isLoggedIn);
    const { message } = useMessage();
    const queryClient = useQueryClient();

    const plain    = appearance === 'plain';
    const iconSize = size === 'sm' ? 18 : 22;
    const btnSize  = !plain && size === 'sm' ? 36 : 44;

    // initialStatus가 주어지면 그 값으로 캐시를 미리 채워두고(자체 조회 스킵), 없으면 직접 조회
    const { data: favoriteData, isError: statusFailed, isFetching: statusFetching, refetch: refetchStatus } = useQuery({
        queryKey: favoriteKeys.status(storeId),
        queryFn: async () => {
            const res = await favoriteService.getStatus(storeId);
            return res?.isFavorite ?? res?.favorite ?? false;
        },
        enabled: !preview && isLoggedIn && initialStatus === undefined,
        initialData: initialStatus,
    });
    const isFavorite = favoriteData ?? false;
    // 서버의 찜 API 는 "지금 상태를 뒤집는" 토글이다. 상태를 모르는 채로 누르게 두면, 이미 찜한 가게인데
    // 조회만 실패해 빈 하트로 보이는 상태에서 "찜하려고" 누른 사용자가 오히려 찜을 해제하게 된다(2026-09-21).
    // 그래서 상태를 모르면(조회 실패·첫 조회 중) 토글을 막고, 실패했으면 누를 때 다시 조회한다.
    const statusUnknown = favoriteData === undefined;

    const toggleMutation = useFavoriteToggle(storeId, queryClient, message);

    const handleToggle = (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (toggleMutation.isPending) return;
        if (statusUnknown) {
            if (statusFailed && !statusFetching) void refetchStatus();
            return;
        }
        toggleMutation.mutate();
    };

    if (preview) {
        return <FavoritePreview plain={plain} btnSize={btnSize} iconSize={iconSize} style={style} />;
    }

    // 로그인하지 않은 사용자에게는 버튼 미표시
    if (!isLoggedIn) return null;

    const accessibleLabel = getAccessibleLabel(statusUnknown, statusFailed, isFavorite);
    const blocked = toggleMutation.isPending || (statusUnknown && (!statusFailed || statusFetching));

    return (
        <button
            type="button"
            onClick={handleToggle}
            disabled={blocked}
            className={favoriteClassName(plain)}
            aria-label={accessibleLabel}
            aria-pressed={statusUnknown ? undefined : isFavorite}
            aria-busy={toggleMutation.isPending || (statusUnknown && statusFetching) || undefined}
            style={buildButtonStyle({ plain, btnSize, blocked, statusUnknown, style })}
            title={accessibleLabel}
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
    appearance: PropTypes.oneOf(['overlay', 'plain']),
    style: PropTypes.object,
    preview: PropTypes.bool,
};

export default FavoriteButton;
