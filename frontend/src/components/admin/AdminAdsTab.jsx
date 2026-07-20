import React, { useState, useMemo, useEffect } from 'react';
import { Tag, Typography } from 'antd';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { StopOutlined } from '@ant-design/icons';
import { Button, AdminTableSkeleton, DataTable, FilterToolbar } from '../common';
import SanctionModal from './SanctionModal';
import { useMessage, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adKeys } from '../../hooks/queryKeys';
import adService from '../../services/adService';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

const STATUS_CONFIG = {
    PENDING_PAYMENT: { color: 'default', label: '결제 대기' },
    PAYMENT_FAILED:  { color: 'red',     label: '결제 실패' },
    ACTIVE:          { color: 'green',   label: '노출 중' },
    EXPIRED:         { color: 'default', label: '만료됨' },
    SUSPENDED:       { color: 'red',     label: '중단됨' },
    // 2026-07 추가: AdStatus엔 진작 CANCELLED/REFUNDED가 있는데 여기에만 빠져 있어서,
    // 사업자가 광고를 취소하면 관리자 화면엔 원문 "CANCELLED"가 그대로 노출됐다.
    CANCELLED:       { color: 'default', label: '취소됨' },
    REFUNDED:        { color: 'purple',  label: '환불됨' },
};

/**
 * 관리자 광고 관리 탭 — 전체 광고 목록 조회 + 강제 중단.
 * 사전 승인 없이 결제 즉시 노출되는 방식이라, 문제되는 광고를 여기서 사후에 내린다.
 *
 * 2026-07-09: TanStack Query로 전환 (adKeys.admin()) — 중단 처리도 useMutation으로
 * 바꿔서 성공 시 같은 쿼리를 무효화, 별도 loadData() 재호출이 필요 없어짐.
 *
 * 코드리뷰 지적사항 반영(2026-07): 예전엔 size=100 고정으로 한 번에 다 받아와서, 광고가
 * 100건을 넘으면 그 뒤는 관리자 화면에 아예 안 보이는 문제가 있었음 — page를 실제
 * 서버사이드 파라미터로 두고 AntD Table의 pagination과 동기화(AuditLogTab.jsx와 동일 패턴).
 * 단, 검색(가게명)은 여전히 클라이언트 사이드라 "현재 로드된 페이지 안에서만" 필터링됨 —
 * 이 엔드포인트가 서버 키워드 검색 파라미터를 아직 지원하지 않아서(백엔드 변경 필요),
 * 지금 규모(광고 수 적음)에서는 감수할 만한 트레이드오프로 남겨둠.
 *
 * 2026-07 전수조사 — search/page를 URL 쿼리스트링에 동기화(useQueryParamState) —
 * 새로고침해도 유지되고 링크 공유도 가능해짐(MembersTab 등과 동일한 이유).
 */
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', page: '0' };
// ads/?? []가 매 렌더 새 배열 레퍼런스를 만들어서 아래 filteredAds useMemo가 매번
// 다시 계산되는 걸 방지하기 위한 안정적인 빈 배열 상수(ESLint exhaustive-deps 지적 반영)
const EMPTY_ADS = [];

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 값을 유지 (2026-07 전수조사)
const SKELETON_HEADERS = ['가게', '유형', '기간', '금액', '상태', '처리'];
const SKELETON_COLS    = [220, 90, 190, 100, 160, 110];

// 스켈레톤 행 개수를 "실제로 채워질 행 수"로 계산 (AuditLogTab과 동일 — 2026-07 추가).
// keepPreviousData 덕에 페이지 이동 시엔 이미 total을 알고 있으므로 마지막 페이지가 3건이면
// 스켈레톤도 3줄만 그려서 화면이 튀지 않는다. 최초 로딩엔 pageSize로 폴백.
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
    // 2026-07 추가 — 중단 사유 입력을 위해 confirm() 대신 SanctionModal(AD_SUSPEND 프리셋) 사용.
    // 어떤 광고를 중단하려는지 기억해야 해서 target을 state로 들고 있는다(null = 닫힌 상태).
    const [suspendTarget, setSuspendTarget] = useState(null);

    const { data, isLoading: loading, isFetching, error: adsError, refetch } = useQuery({
        queryKey: [...adKeys.admin(), page],
        queryFn: async () => {
            const result = await adService.getAllAds(page, PAGE_SIZE);
            return {
                ads: result?.content ?? [],
                // Spring Boot 3.5부터 페이지 메타가 page:{} 하위로 이동(2026-07 버그 수정 — 다른
                // 화면들과 동일 이슈) — 신버전을 우선 읽고 구버전도 폴백으로 허용.
                totalElements: result?.page?.totalElements ?? result?.totalElements ?? 0,
            };
        },
        // 2026-07 전수조사: keepPreviousData가 없어서 페이지를 넘길 때마다 data가 잠시 undefined가 되며
        // 스켈레톤이 띄었다 사라졌다(깜빡임) — AuditLogTab과 동일하게 이전 페이지 데이터를
        // 유지하도록 변경. 로딩 신호는 아래 (loading || isFetching) 조건이 담당한다.
        placeholderData: keepPreviousData,
    });
    const ads = data?.ads ?? EMPTY_ADS;
    const totalElements = data?.totalElements ?? 0;
    useEffect(() => {
        if (adsError) message.error('광고 목록을 불러오지 못했습니다.');
    }, [adsError, message]);

    const suspendMutation = useMutation({
        mutationFn: ({ adId, reason }) => adService.suspendAd(adId, reason),
        onSuccess: () => {
            message.success('광고가 중단되었습니다.');
            queryClient.invalidateQueries({ queryKey: adKeys.admin() });
            setSuspendTarget(null);
        },
        onError: () => message.error('중단 처리에 실패했습니다.'),
    });

    const filteredAds = useMemo(() => {
        if (!debouncedSearch.trim()) return ads;
        const kw = debouncedSearch.toLowerCase();
        return ads.filter((a) => a.storeName?.toLowerCase().includes(kw));
    }, [ads, debouncedSearch]);

    const handleSuspend = (record) => setSuspendTarget(record);

    const columns = [
        { title: '가게', dataIndex: 'storeName', key: 'storeName', width: 220, ellipsis: true },
        { title: '유형', dataIndex: 'adType', key: 'adType', width: 90, render: (v) => (v === 'BADGE' ? '배지형' : '배너형') },
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

    return (
        <div>
            <FilterToolbar
                count={totalElements}
                search={{ value: search, onChange: handleSearchChange, placeholder: '가게명으로 검색 (현재 페이지 내)', disabled: loading }}
                onReload={refetch}
                loading={loading || isFetching}
            />
            {(loading || isFetching) ? (
                <AdminTableSkeleton
                    rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={1}
                    pagination={totalElements ? { current: page + 1, pageSize: PAGE_SIZE, total: totalElements } : null}
                />
            ) : (
                <DataTable
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredAds}
                    pagination={{
                        current: page + 1,
                        pageSize: PAGE_SIZE,
                        total: totalElements,
                        showSizeChanger: false,
                        onChange: (p) => setPage(p - 1),
                    }}
                    locale={{ emptyText: '등록된 광고가 없습니다.' }}
                />
            )}

            <SanctionModal
                open={!!suspendTarget}
                presetKey="AD_SUSPEND"
                target={{ name: suspendTarget?.storeName }}
                loading={suspendMutation.isPending}
                onCancel={() => setSuspendTarget(null)}
                onOk={({ reason }) => suspendMutation.mutateAsync({ adId: suspendTarget.id, reason })}
            />
        </div>
    );
};

export default AdminAdsTab;
