import React, { useState } from 'react';
import { Tag, Typography } from 'antd';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { StopOutlined } from '../common/icons';
import { Button, AdminTableSkeleton, DataState, DataTable, FilterToolbar } from '../common';
import SanctionModal from './SanctionModal';
import { useMessage, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adKeys } from '../../hooks/queryKeys';
import { invalidateAdData } from '../../hooks/invalidateAfterWrite';
import adService from '../../services/adService';
import { AD_TYPE_LABELS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

const STATUS_CONFIG = {
    PENDING_PAYMENT: { color: 'default', label: '결제 대기' },
    PAYMENT_FAILED:  { color: 'red',     label: '결제 실패' },
    ACTIVE:          { color: 'green',   label: '노출 중' },
    EXPIRED:         { color: 'default', label: '만료됨' },
    SUSPENDED:       { color: 'red',     label: '중단됨' },
    // 취소·환불 상태도 광고 필터에 포함한다.

    CANCELLED:       { color: 'default', label: '취소됨' },
    REFUNDED:        { color: 'purple',  label: '환불됨' },
};

/**
 * 관리자 광고 목록과 강제 중단을 처리한다.
 * 검색·페이지는 URL과 서버 조회에 반영하고 중단 성공 후 관련 쿼리를 무효화한다.
 * 로딩 뼈대는 실제 열 규격과 현재 페이지의 예상 행 수를 따른다.
 */
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', page: '0' };
// data?.ads ?? [] 가 매 렌더 새 배열 레퍼런스를 만들면 이 값을 deps로 받는 훅·자식이
// 매번 다시 계산·리렌더된다. 안정적인 빈 배열 상수로 그걸 막는다.
// (원래는 클라이언트 필터 useMemo 때문에 도입했는데, 그 필터를 서버로 옮긴 뒤에도
//  dataSource 레퍼런스 안정성 때문에 그대로 두는 게 맞다)
const EMPTY_ADS = [];

// 골격과 실제 테이블은 같은 열 규격을 사용한다.
const SKELETON_HEADERS = ['가게', '유형', '기간', '금액', '상태', '처리'];
const SKELETON_COLS    = [220, 90, 190, 100, 160, 110];

// 현재 페이지에 표시할 행 수만큼 골격을 그린다.

const skeletonRowCount = (total, pageIdx, pageSize) => {
    if (!total) return Math.min(6, pageSize);
    const remaining = total - pageIdx * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

const AdminAdsTab = () => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const [{ search, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const debouncedSearch = useDebounce(search, 300);
    const page = Number(pageStr) || 0;
    const setPage = (p) => setQuery({ page: String(p) });
    // 검색어가 바뀌면 현재 페이지 범위가 달라지므로 0페이지로 복귀(하나의 setQuery 호출로 묶음 — useQueryParamState.js 상단 주석 참고).
    const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '0' });
    // 중단 사유 입력은 SanctionModal의 AD_SUSPEND 형식을 사용한다.

    const [suspendTarget, setSuspendTarget] = useState(null);

    const { data, isLoading: loading, isFetching, isPlaceholderData, error: adsError, refetch } = useQuery({
        queryKey: [...adKeys.admin(), page, debouncedSearch],
        queryFn: async () => {
            const result = await adService.getAllAds(page, PAGE_SIZE, debouncedSearch);
            return {
                ads: result?.content ?? [],
                // Spring 페이지의 page 하위 메타데이터를 읽는다.

                totalElements: result?.page?.totalElements ?? result?.totalElements ?? 0,
            };
        },
        // 페이지·검색 전환에는 이전 결과를 유지한다. 표 본문은 placeholder 상태에서만 스켈레톤으로
        // 바꾸고, 같은 조건의 수동 새로고침은 기존 행을 유지한 채 툴바에만 진행 상태를 표시한다.
        placeholderData: keepPreviousData,
    });
    const ads = data?.ads ?? EMPTY_ADS;
    const totalElements = data?.totalElements ?? 0;
    const suspendMutation = useMutation({
        mutationFn: ({ adId, reason }) => adService.suspendAd(adId, reason),
        onSuccess: () => {
            message.success('광고가 중단됐어요.');
            // 관리자 광고 목록(adKeys.admin)뿐 아니라 공개 배너·배지에서도 빠져야 한다.
            void invalidateAdData(queryClient);
            setSuspendTarget(null);
        },
        onError: () => message.error('중단 처리에 실패했어요.'),
    });

    // 클라이언트 필터(filteredAds)는 제거했다 — 서버가 검색까지 처리하므로 받은 결과가 곧 정답이다.
    // useDebounce는 그대로 둔다. 이제는 "리렌더 억제"가 아니라 **타이핑 한 글자마다 서버를 때리지
    // 않기 위한 것**이라 오히려 더 중요해졌다(300ms).
    const handleSuspend = (record) => setSuspendTarget(record);

    const columns = [
        { title: '가게', dataIndex: 'storeName', key: 'storeName', width: 220, ellipsis: true },
        { title: '유형', dataIndex: 'adType', key: 'adType', width: 90, render: (v) => AD_TYPE_LABELS[v] || v },
        { title: '기간', key: 'period', width: 190, render: (_, r) => `${r.startDate} ~ ${r.endDate}` },
        { title: '금액', dataIndex: 'amount', key: 'amount', width: 100, render: (v) => `${v?.toLocaleString()}원` },
        {
            title: '상태', dataIndex: 'status', key: 'status', width: 160,
            render: (v, r) => (
                <div>
                    <Tag color={STATUS_CONFIG[v]?.color}>{STATUS_CONFIG[v]?.label || v}</Tag>
                    {r.suspendReason && <Text style={{ fontSize: fontSize.xs, color: colors.text.tertiary, display: 'block' }}>{r.suspendReason}</Text>}
                </div>
            ),
        },
        {
            title: '처리', key: 'actions', width: 110,
            render: (_, r) => (
                r.status === 'ACTIVE'
                    ? <Button variant="ghost-sm-danger" loading={suspendMutation.isPending && suspendMutation.variables?.adId === r.id} onClick={() => handleSuspend(r)}><StopOutlined /> 중단</Button>
                    : null
            ),
        },
    ];

    // 광고 목록 본문 — 오류 → 로딩(스켈레톤) → 표 순으로 판정한다.
    const renderAdList = () => {
        if (adsError) {
            return (
                <DataState state="error" kind="advertisement" subject="광고 목록" error={adsError}
                    onRetry={refetch} retrying={isFetching} />
            );
        }
        if (loading || isPlaceholderData) {
            return (
                <AdminTableSkeleton
                    rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={1}
                    pagination={totalElements ? { current: page + 1, pageSize: PAGE_SIZE, total: totalElements } : null}
                />
            );
        }
        return (
            <DataTable
                rowKey="id"
                columns={columns}
                dataSource={ads}
                pagination={{
                    current: page + 1,
                    pageSize: PAGE_SIZE,
                    total: totalElements,
                    showSizeChanger: false,
                    onChange: (p) => setPage(p - 1),
                }}
                locale={{ emptyText: '등록된 광고가 없어요.' }}
            />
        );
    };

    return (
        <div>
            <FilterToolbar
                count={totalElements}
                search={{ value: search, onChange: handleSearchChange, placeholder: '가게명으로 검색 (현재 페이지 내)', disabled: loading }}
                onReload={refetch}
                loading={loading || isFetching}
                initialLoading={loading}
            />
            {renderAdList()}

            <SanctionModal
                open={!!suspendTarget}
                presetKey="AD_SUSPEND"
                target={{ name: suspendTarget?.storeName }}
                loading={suspendMutation.isPending}
                onCancel={() => setSuspendTarget(null)}
                onOk={({ reason }) => {
                    if (!suspendTarget) return;
                    return suspendMutation.mutateAsync({ adId: suspendTarget.id, reason });
                }}
            />
        </div>
    );
};

export default AdminAdsTab;
