/*
 * 서버 검색·페이지별 캐시를 분리하고 검색·페이지 초기화를 함께 반영한다.
 */
import React, { useState } from 'react';
import { Typography, Tag } from 'antd';
import StatusHint from '../common/StatusHint';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { PauseCircleOutlined, StopOutlined, UndoOutlined } from '../common/icons';
import { Button, FilterToolbar, AdminTableSkeleton, DataState, DataTable } from '../common';
import SanctionModal from './SanctionModal';
import { useMessage, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adminKeys } from '../../hooks/queryKeys';
import { invalidateAdminData } from '../../hooks/invalidateAfterWrite';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

const MEMBER_STATUS_CONFIG = {
    ACTIVE:    { color: 'green',  label: '정상' },
    SUSPENDED: { color: 'orange', label: '정지' },
    BANNED:    { color: 'red',    label: '영구정지' },
};

const getSuspendTooltip = (r) => {
    if (!r.suspendReason) return '';
    const until = r.suspendedUntil ? ` (~${r.suspendedUntil})` : '';
    return `사유: ${r.suspendReason}${until}`;
};

const getRoleColor = (role) => {
    if (role === 'ADMIN') return 'red';
    if (role === 'BUSINESS') return 'blue';
    return 'default';
};

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 자리에서 관리
const SKELETON_HEADERS = ['ID', '이름', '이메일', '권한', '로그인', '상태', '처리'];
const SKELETON_COLS    = [60, 100, 220, 90, 90, 90, 230];
const PAGE_SIZE = 20;
const QUERY_DEFAULTS = { search: '', page: '1' };

const skeletonRowCount = (total, pageIdx1, pageSize) => {
    if (!total) return Math.min(8, pageSize);
    const remaining = total - (pageIdx1 - 1) * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

// 빈 목록은 안정된 배열 참조를 사용해 불필요한 테이블 갱신을 줄인다.

const EMPTY_MEMBERS = [];

const MembersTab = () => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();
    const [{ search: memberSearch, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const debouncedMemberSearch = useDebounce(memberSearch, 300);
    const page = Number(pageStr) || 1;

    const [sanctionTarget, setSanctionTarget] = useState(null);
    const [suspendOpen, setSuspendOpen]       = useState(false);
    const [banOpen, setBanOpen]               = useState(false);

    const {
        data, isLoading: memberLoading, isFetching, isPlaceholderData, error: membersError, refetch,
    } = useQuery({
        // 검색어와 페이지를 조회 키에 포함해 서버 결과를 분리한다.

        queryKey: [...adminKeys.members(), page, debouncedMemberSearch],
        queryFn: async () => {
            // 서버는 0-based, 이 화면은 1-based(AntD Table) — 여기서 한 번만 변환한다.
            const result = await api.get(API_ENDPOINTS.ADMIN_MANAGE.MEMBERS, {
                params: {
                    page: page - 1,
                    size: PAGE_SIZE,
                    ...(debouncedMemberSearch.trim() ? { search: debouncedMemberSearch.trim() } : {}),
                },
            });
            return {
                members: result?.content ?? [],
                // page 안의 페이지 메타를 우선 읽고 루트 형식도 허용한다.
                totalElements: result?.page?.totalElements ?? result?.totalElements ?? 0,
            };
        },
        placeholderData: keepPreviousData,
    });
    const members = data?.members ?? EMPTY_MEMBERS;
    const totalElements = data?.totalElements ?? 0;

    // 입력 안정화 뒤 서버 검색을 요청한다.

    // 검색어가 바뀌어 결과가 줄어들면 이전 페이지 번호가 존재하지 않는 페이지를 가리킬 수 있어 1로 복귀.
    // 검색어와 첫 페이지는 한 번의 URL 갱신으로 반영한다.
    const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '1' });
    const setPage = (p) => setQuery({ page: String(p) });

    // 제재는 회원 목록뿐 아니라 감사 로그·대시보드도 바꾼다.
    const invalidateMembers = () => invalidateAdminData(queryClient);

    const suspendMutation = useMutation({
        mutationFn: ({ id, days, reason }) => api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_SUSPEND(id), { days: String(days), reason: reason || '' }),
        onSuccess: (_, { days }) => {
            message.success(`${days}일간 정지 처리됐어요.`);
            setSuspendOpen(false);
            void invalidateMembers();
        },
        onError: () => message.error('정지 처리에 실패했어요.'),
    });

    const banMutation = useMutation({
        mutationFn: ({ id, reason }) => api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_BAN(id), { reason: reason || '' }),
        onSuccess: () => {
            message.success('영구 정지 처리됐어요.');
            setBanOpen(false);
            void invalidateMembers();
        },
        onError: () => message.error('영구 정지에 실패했어요.'),
    });

    const unbanMutation = useMutation({
        mutationFn: (id) => api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_UNBAN(id)),
        onSuccess: () => {
            message.success('정지가 해제됐어요.');
            void invalidateMembers();
        },
        onError: () => message.error('해제에 실패했어요.'),
    });

    const handleSuspend = ({ days, reason }) => {
        if (!sanctionTarget) return;
        suspendMutation.mutate({ id: sanctionTarget.id, days, reason });
    };

    const handleBan = ({ reason }) => {
        if (!sanctionTarget) return;
        banMutation.mutate({ id: sanctionTarget.id, reason });
    };

    // 정지 해제 — 되돌리기 애매한 액션이라 즉시 실행 대신 확인 모달 한 번 거침
    const handleUnban = (r) => {
        confirm({
            title: '정지 해제',
            content: `'${r.name || r.email}' 님의 정지를 해제할까요?`,
            okText: '해제', cancelText: '취소', centered: true,
            onOk: () => unbanMutation.mutateAsync(r.id),
        });
    };

    const memberColumns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60, render: v => <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>{v}</Text> },
        { title: '이름', dataIndex: 'name', key: 'name', width: 100, render: v => <Text style={{ fontSize: fontSize.sm }}>{v || '-'}</Text> },
        { title: '이메일', dataIndex: 'email', key: 'email', width: 220, ellipsis: true, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '권한', dataIndex: 'role', key: 'role', width: 90, render: v => <Tag color={getRoleColor(v)}>{v}</Tag> },
        { title: '로그인', dataIndex: 'provider', key: 'provider', width: 90, render: v => <Tag>{v}</Tag> },
        { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: (v, r) => {
            const cfg = MEMBER_STATUS_CONFIG[v] || MEMBER_STATUS_CONFIG.ACTIVE;
            const reason = getSuspendTooltip(r);
            return <StatusHint label={cfg.label} color={cfg.color} description={reason} />;
        }},
        { title: '처리', key: 'actions', width: 230, render: (_, r) => (
            // 회원은 휴지통 미사용 — 정지/영구정지/해제만 존재
            // 회원 탈퇴는 본인만 가능 (MemberApiController), 관리자가 회원을 삭제하는 인터페이스는 제공하지 않음
            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center', whiteSpace: 'nowrap' }}>
                {r.role !== 'ADMIN' && (<>
                    {(!r.status || r.status === 'ACTIVE') && (<>
                        <Button variant="ghost-sm" onClick={() => { setSanctionTarget(r); setSuspendOpen(true); }} style={{ color: '#fa8c16' }}><PauseCircleOutlined /> 정지</Button>
                        <Button variant="ghost-sm-danger" onClick={() => { setSanctionTarget(r); setBanOpen(true); }}><StopOutlined /> 영구정지</Button>
                    </>)}
                    {(r.status === 'SUSPENDED' || r.status === 'BANNED') && (
                        <Button variant="ghost-sm-success" loading={unbanMutation.isPending && unbanMutation.variables === r.id} onClick={() => handleUnban(r)}><UndoOutlined /> 정지해제</Button>
                    )}
                </>)}
            </div>
        )},
    ];

    // 목록 영역 — 오류 / 첫 로딩·페이지 전환 스켈레톤 / 표
    let tableBody;
    if (membersError) {
        tableBody = (
            <DataState state="error" kind="member" subject="회원 목록" error={membersError}
                onRetry={refetch} retrying={isFetching} />
        );
    } else if (memberLoading || isPlaceholderData || memberSearch.trim() !== debouncedMemberSearch.trim()) {
        tableBody = (
            <AdminTableSkeleton
                rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                cols={SKELETON_COLS}
                headers={SKELETON_HEADERS}
                actionBtns={2}
                pagination={totalElements ? { current: page, pageSize: PAGE_SIZE, total: totalElements } : null}
            />
        );
    } else {
        tableBody = (
            <DataTable
                columns={memberColumns}
                dataSource={members}
                rowKey="id"
                pagination={{ current: page, pageSize: PAGE_SIZE, total: totalElements, onChange: setPage }}
                locale={{ emptyText: '회원이 없어요.' }}
            />
        );
    }

    return (
        <>
            <FilterToolbar
                count={totalElements}
                search={{ value: memberSearch, onChange: handleSearchChange, placeholder: '이름, 이메일로 검색' }}
                onReload={refetch}
                loading={memberLoading || isFetching}
                initialLoading={memberLoading}
            />
            {tableBody}

            {/*
             * 입력 초기화는 destroyOnHidden에 맡겨 닫힘 전환 중 모달을 재마운트하지 않는다.
             */}
            <SanctionModal
                presetKey="MEMBER_SUSPEND"
                open={suspendOpen}
                target={sanctionTarget}
                onCancel={() => setSuspendOpen(false)}
                onOk={handleSuspend}
                loading={suspendMutation.isPending}
            />
            <SanctionModal
                presetKey="MEMBER_BAN"
                open={banOpen}
                target={sanctionTarget}
                onCancel={() => setBanOpen(false)}
                onOk={handleBan}
                loading={banMutation.isPending}
            />
        </>
    );
};

export default MembersTab;
