/**
 * RESERVE - 관리자 가게 관리 탭
 * AdminPanel.jsx에서 분리 (Cognitive Complexity 17 → 15 목표)
 *
 * 2026-07-09: MembersTab과 동일하게 TanStack Query(adminKeys.stores()) + placeholderData:
 * keepPreviousData로 전환, 정지/영구폐업/해제는 useMutation, raw <Table> → 공용 DataTable.
 *
 * 2026-07 전수조사 — MembersTab과 동일한 3가지 수정:
 * 1) StoreSuspendModal/StoreBanModal 로컬 정의를 공용 SanctionModal로 통합 +
 *    key={open ? 'x-open' : 'x-closed'} 강제 remount 제거(닫힘 애니메이션이 죽던 원인).
 * 2) AdminTableSkeleton에 실제 headers/cols 배선.
 * 3) 로딩 조건을 (isLoading || isFetching)으로 통일.
 * 4) 검색어/페이지를 URL 쿼리스트링에 동기화(useQueryParamState) — MembersTab과 동일한 이유.
 */
import React, { useState, useEffect } from 'react';
import { Typography, Tag, Tooltip } from 'antd';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { PauseCircleOutlined, StopOutlined, UndoOutlined } from '@ant-design/icons';
import { Button, FilterToolbar, AdminTableSkeleton, DataTable } from '../common';
import SanctionModal from './SanctionModal';
import { useMessage, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adminKeys } from '../../hooks/queryKeys';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

const STORE_STATUS_CONFIG = {
    ACTIVE:    { color: 'green',  label: '정상' },
    SUSPENDED: { color: 'orange', label: '영업정지' },
    BANNED:    { color: 'red',    label: '영구폐업' },
};

const getStoreSuspendTooltip = (r) => {
    if (!r.suspendReason) return '';
    const until = r.suspendedUntil ? ` (~${r.suspendedUntil})` : '';
    return `사유: ${r.suspendReason}${until}`;
};

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 자리에서 관리
const SKELETON_HEADERS = ['ID', '가게명', '카테고리', '주소', '평점', '상태', '처리'];
const SKELETON_COLS    = [60, 180, 100, 200, 70, 90, 230];
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', page: '1' };

// MembersTab과 동일한 2026-07 전수조사 사유 — pagination을 DataTable에 제어시켜서 무효화/영구폐업
// 뮤테이션 후 재마운트되면서 페이지가 1로 튀는 버그와, 스켈레톤에 pagination 미전달로 로딩 중 페이지
// 버튼이 사라지던 문제를 동시에 해결.
const skeletonRowCount = (total, pageIdx1, pageSize) => {
    if (!total) return Math.min(8, pageSize);
    const remaining = total - (pageIdx1 - 1) * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

const StoresAdminTab = () => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const [{ search: storeSearch, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const debouncedStoreSearch = useDebounce(storeSearch, 300);
    const page = Number(pageStr) || 1;
    const setPage = (p) => setQuery({ page: String(p) });

    const [storeSanctionTarget, setStoreSanctionTarget] = useState(null);
    const [storeSuspendOpen, setStoreSuspendOpen]       = useState(false);
    const [storeBanOpen, setStoreBanOpen]               = useState(false);

    const {
        data: stores = [], isLoading: storeLoading, isFetching, error: storesError, refetch,
    } = useQuery({
        queryKey: adminKeys.stores(),
        queryFn: async () => {
            const data = await api.get(API_ENDPOINTS.ADMIN_MANAGE.STORES, { params: { page: 0, size: 100 } });
            return data?.content ?? [];
        },
        placeholderData: keepPreviousData,
    });
    useEffect(() => {
        if (storesError) message.error('가게 목록을 불러오지 못했습니다.');
    }, [storesError, message]);

    const filteredStores = React.useMemo(() => {
        if (!debouncedStoreSearch.trim()) return stores;
        const kw = debouncedStoreSearch.toLowerCase();
        return stores.filter(s => s.name?.toLowerCase().includes(kw) || s.address?.toLowerCase().includes(kw));
    }, [stores, debouncedStoreSearch]);

    // 검색어로 결과가 줄면 존재하지 않는 페이지를 가리킬 수 있어 1로 복귀
    const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '1' });

    const invalidateStores = () => queryClient.invalidateQueries({ queryKey: adminKeys.stores() });

    const suspendMutation = useMutation({
        mutationFn: ({ id, days, reason }) => api.post(API_ENDPOINTS.ADMIN_MANAGE.STORE_SUSPEND(id), { days: String(days), reason: reason || '' }),
        onSuccess: (_, { days }) => {
            message.success(`${days}일간 영업정지 처리되었습니다.`);
            setStoreSuspendOpen(false);
            invalidateStores();
        },
        onError: () => message.error('영업정지 처리에 실패했습니다.'),
    });

    const banMutation = useMutation({
        mutationFn: ({ id, reason }) => api.post(API_ENDPOINTS.ADMIN_MANAGE.STORE_BAN(id), { reason: reason || '' }),
        onSuccess: () => {
            message.success('영구 폐업 처리되었습니다.');
            setStoreBanOpen(false);
            invalidateStores();
        },
        onError: () => message.error('영구 폐업 처리에 실패했습니다.'),
    });

    const unbanMutation = useMutation({
        mutationFn: (id) => api.post(API_ENDPOINTS.ADMIN_MANAGE.STORE_UNBAN(id)),
        onSuccess: () => {
            message.success('영업정지가 해제되었습니다.');
            invalidateStores();
        },
        onError: () => message.error('해제에 실패했습니다.'),
    });

    const handleStoreSuspend = ({ days, reason }) => {
        if (!storeSanctionTarget) return;
        suspendMutation.mutate({ id: storeSanctionTarget.id, days, reason });
    };

    const handleStoreBan = ({ reason }) => {
        if (!storeSanctionTarget) return;
        banMutation.mutate({ id: storeSanctionTarget.id, reason });
    };

    // 정지 해제 — 되돌리기 애매한 액션이라 즉시 실행 대신 확인 모달 한 번 거침
    const handleStoreUnban = (r) => {
        confirm({
            title: '영업정지 해제',
            content: `'${r.name}' 가게의 정지를 해제하시겠습니까?`,
            okText: '해제', cancelText: '취소', centered: true,
            onOk: () => unbanMutation.mutateAsync(r.id),
        });
    };

    const storeAdminColumns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60, render: v => <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>{v}</Text> },
        { title: '가게명', dataIndex: 'name', key: 'name', width: 180, ellipsis: true, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '카테고리', dataIndex: 'category', key: 'category', width: 100, render: v => <Tag>{v || '-'}</Tag> },
        { title: '주소', dataIndex: 'address', key: 'address', width: 200, ellipsis: true, render: v => <Text style={{ fontSize: fontSize.sm }}>{v || '-'}</Text> },
        { title: '평점', dataIndex: 'rating', key: 'rating', width: 70, render: v => <Text style={{ fontSize: fontSize.sm }}>{v?.toFixed(1) || '0.0'}</Text> },
        { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: (v, r) => {
            const cfg = STORE_STATUS_CONFIG[v] || STORE_STATUS_CONFIG.ACTIVE;
            return <Tooltip title={getStoreSuspendTooltip(r)}><Tag color={cfg.color}>{cfg.label}</Tag></Tooltip>;
        }},
        { title: '처리', key: 'actions', width: 230, render: (_, r) => (
            // 가게도 휴지통 미사용 — 영업정지/영구폐업/해제만 존재
            // 가게 삭제는 사업자 본인만 가능 (StoreApiController)
            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center', whiteSpace: 'nowrap' }}>
                {(!r.status || r.status === 'ACTIVE') && (<>
                    <Button variant="ghost-sm" onClick={() => { setStoreSanctionTarget(r); setStoreSuspendOpen(true); }} style={{ color: '#fa8c16' }}><PauseCircleOutlined /> 영업정지</Button>
                    <Button variant="ghost-sm-danger" onClick={() => { setStoreSanctionTarget(r); setStoreBanOpen(true); }}><StopOutlined /> 영구폐업</Button>
                </>)}
                {(r.status === 'SUSPENDED' || r.status === 'BANNED') && (
                    <Button variant="ghost-sm-success" loading={unbanMutation.isPending && unbanMutation.variables === r.id} onClick={() => handleStoreUnban(r)}><UndoOutlined /> 정지해제</Button>
                )}
            </div>
        )},
    ];

    return (
        <>
            <FilterToolbar
                count={filteredStores.length}
                search={{ value: storeSearch, onChange: handleSearchChange, placeholder: '가게명, 주소로 검색' }}
                onReload={refetch}
                loading={storeLoading || isFetching}
            />
            {(storeLoading || isFetching) ? (
                <AdminTableSkeleton
                    rows={skeletonRowCount(filteredStores.length, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={2}
                    pagination={filteredStores.length ? { current: page, pageSize: PAGE_SIZE, total: filteredStores.length } : null}
                />
            ) : (
                <DataTable
                    columns={storeAdminColumns}
                    dataSource={filteredStores}
                    rowKey="id"
                    pagination={{ current: page, pageSize: PAGE_SIZE, total: filteredStores.length, onChange: setPage }}
                    locale={{ emptyText: '가게가 없습니다.' }}
                />
            )}

            {/* key 토글 제거 — SanctionModal의 destroyOnHidden이 입력값 초기화를 담당하므로
                강제 remount 없이도 닫힘 애니메이션이 정상 재생된다 */}
            <SanctionModal
                presetKey="STORE_SUSPEND"
                open={storeSuspendOpen}
                target={storeSanctionTarget}
                onCancel={() => setStoreSuspendOpen(false)}
                onOk={handleStoreSuspend}
                loading={suspendMutation.isPending}
            />
            <SanctionModal
                presetKey="STORE_BAN"
                open={storeBanOpen}
                target={storeSanctionTarget}
                onCancel={() => setStoreBanOpen(false)}
                onOk={handleStoreBan}
                loading={banMutation.isPending}
            />
        </>
    );
};

export default StoresAdminTab;
