/**
 * RESERVE - 관리자 회원 관리 탭
 * AdminPanel.jsx에서 분리 (Cognitive Complexity 17 → 15 목표)
 *
 * 2026-07-09: TanStack Query로 전환 (adminKeys.members()) + placeholderData: keepPreviousData.
 * 정지/영구정지/해제도 useMutation으로 전환, 성공 시 같은 쿼리를 무효화.
 * raw <Table>을 공용 DataTable로 교체.
 *
 * 2026-07 전수조사 —
 * 1) SuspendModal/BanModal을 여기서 직접 정의하던 걸 공용 SanctionModal로 통합
 *    (StoresAdminTab의 거의 동일한 모달 2개까지 총 4벌 중복이었음).
 *    동시에 key={open ? 'x-open' : 'x-closed'} 강제 remount 패턴을 제거 —
 *    이게 닫힘 애니메이션이 재생되지 않던 원인이었다(닫는 순간 key가 바뀌어 언마운트).
 *    SanctionModal이 destroyOnHidden으로 입력값 초기화를 대신 처리한다.
 * 2) AdminTableSkeleton에 실제 컬럼 제목(headers)과 실제 컬럼 너비(cols)를 넘김 —
 *    헤더는 고정 텍스트라 가릴 이유가 없고, cols가 없으면 기본 6칸이라 실제 7칸과 안 맞아
 *    로딩 종료 시 열이 재배치되며 화면이 튀었다.
 * 3) 로딩 조건을 다른 탭들과 동일하게 (isLoading || isFetching)으로 통일 —
 *    예전엔 members.length === 0 조건 때문에 새로고침 시엔 아무 로딩 신호도 없었다.
 * 2026-08-09: ★ 페이지네이션·검색을 서버로 올렸다.
 *    예전에는 {@code size: 100} 을 하드코딩해 한 번에 받아온 뒤 그 배열을 filter 했다.
 *    그래서 **101번째 회원부터는 검색은커녕 목록에 뜨지도 않았다**.
 *    AdminAdsTab 이 먼저 거친 길과 똑같은 문제·똑같은 해법이다.
 *    ★ queryKey 에 page 와 debouncedSearch 가 반드시 들어가야 한다 — 빠뜨리면
 *      검색어가 바뀌어도 같은 캐시를 재사용해 화면이 그대로 멈춰 있는다.
 *
 * 4) 검색어/페이지를 URL 쿼리스트링에 동기화(useQueryParamsState) — 새로고침해도 필터가
 *    유지되고 링크 공유도 가능해짐. ★ 검색어 변경 시 페이지를 1로 되돌리는 것까지 한 번의
 *    setQuery 호출로 같이 처리한다 — 따로 호출하면(useQueryParamState 단일 키 버전이었을 때)
 *    뒤에 실행된 페이지 갱신이 검색어 갱신을 덮어써 버리는 버그가 실제로 있었다(브라우저
 *    실측으로 확인). 반드시 하나의 setQuery({ search, page }) 호출로 묶어야 한다.
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

const MEMBER_STATUS_CONFIG = {
    ACTIVE:    { color: 'green',  label: '정상' },
    SUSPENDED: { color: 'orange', label: '정지' },
    BANNED:    { color: 'red',    label: '영구정지' },
};

// SonarCloud: 중첩 삼항 + 중첩 템플릿 리터럴 해소 — 헬퍼 함수로 추출
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

// 2026-07 전수조사: AuditLogTab/AdminAdsTab은 pagination을 DataTable에 제어시켜서(current 보관)
// 로딩 중에도 AdminTableSkeleton에 같은 값을 넘겨 페이지 버튼이 사라지지 않는데, 이 탭은 그동안
// pageSize만 넘기고 current는 AntD Table 내부 상태(uncontrolled)에 맡기고 있었다. 그 결과 두 가지
// 문제가 있었다 — ① 스켈레톤엔 pagination을 아예 안 넘겨서 로딩 중엔 페이지 버튼이 통째로 사라짐
// ② 정지/영구정지 등 뮤테이션 성공 후 목록을 무효화하면 (isLoading||isFetching)이 잠깐 true가 되며
// <DataTable>이 언마운트→재마운트되는데, 그 순간 AntD Table의 내부 페이지 상태도 초기화되어
// 3페이지를 보고 있다가 뮤테이션 한 번에 1페이지로 튕겨나갔다. page를 이 컴포넌트로 끌어올려서 둘 다 해결.
const skeletonRowCount = (total, pageIdx1, pageSize) => {
    if (!total) return Math.min(8, pageSize);
    const remaining = total - (pageIdx1 - 1) * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

// data?.members 가 매 렌더 새 배열 레퍼런스를 만들면 dataSource 가 매번 바뀐 것으로 보여
// Table 이 불필요하게 다시 그려진다. AdminAdsTab 과 같은 이유로 상수 빈 배열을 둔다.
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
        data, isLoading: memberLoading, isFetching, error: membersError, refetch,
    } = useQuery({
        // ★ page·검색어가 쿼리키에 들어가야 한다. 서버가 페이지네이션·검색을 하므로
        //   이 둘이 바뀌면 결과가 달라진다 — 키에 없으면 이전 응답을 그대로 재사용해버린다.
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
                // Spring Boot 3.5부터 페이지 메타가 page:{} 하위로 이동했다 — 신버전을 먼저 읽고 구버전도 폴백.
                totalElements: result?.page?.totalElements ?? result?.totalElements ?? 0,
            };
        },
        placeholderData: keepPreviousData,
    });
    const members = data?.members ?? EMPTY_MEMBERS;
    const totalElements = data?.totalElements ?? 0;
    useEffect(() => {
        if (membersError) message.error('회원 목록을 불러오지 못했습니다.');
    }, [membersError, message]);

    // 클라이언트 filter 는 제거했다 — 서버가 검색까지 처리하므로 받은 결과가 곧 정답이다.
    // useDebounce 는 그대로 둔다. 이젠 "리렌더 억제"가 아니라 **타이핑 한 글자마다 서버를
    // 때리지 않기 위한 것**이라 오히려 더 중요해졌다(300ms).

    // 검색어가 바뀌어 결과가 줄어들면 이전 페이지 번호가 존재하지 않는 페이지를 가리킬 수 있어 1로 복귀.
    // 반드시 한 번의 setQuery 호출로 묶는다(위 파일 상단 주석 참고).
    const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '1' });
    const setPage = (p) => setQuery({ page: String(p) });

    const invalidateMembers = () => queryClient.invalidateQueries({ queryKey: adminKeys.members() });

    const suspendMutation = useMutation({
        mutationFn: ({ id, days, reason }) => api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_SUSPEND(id), { days: String(days), reason: reason || '' }),
        onSuccess: (_, { days }) => {
            message.success(`${days}일간 정지 처리되었습니다.`);
            setSuspendOpen(false);
            invalidateMembers();
        },
        onError: () => message.error('정지 처리에 실패했습니다.'),
    });

    const banMutation = useMutation({
        mutationFn: ({ id, reason }) => api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_BAN(id), { reason: reason || '' }),
        onSuccess: () => {
            message.success('영구 정지 처리되었습니다.');
            setBanOpen(false);
            invalidateMembers();
        },
        onError: () => message.error('영구 정지에 실패했습니다.'),
    });

    const unbanMutation = useMutation({
        mutationFn: (id) => api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_UNBAN(id)),
        onSuccess: () => {
            message.success('정지가 해제되었습니다.');
            invalidateMembers();
        },
        onError: () => message.error('해제에 실패했습니다.'),
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
            content: `'${r.name || r.email}' 님의 정지를 해제하시겠습니까?`,
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
            return <Tooltip title={getSuspendTooltip(r)}><Tag color={cfg.color}>{cfg.label}</Tag></Tooltip>;
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

    return (
        <>
            <FilterToolbar
                count={totalElements}
                search={{ value: memberSearch, onChange: handleSearchChange, placeholder: '이름, 이메일로 검색' }}
                onReload={refetch}
                loading={memberLoading || isFetching}
            />
            {(memberLoading || isFetching) ? (
                <AdminTableSkeleton
                    rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={2}
                    pagination={totalElements ? { current: page, pageSize: PAGE_SIZE, total: totalElements } : null}
                />
            ) : (
                <DataTable
                    columns={memberColumns}
                    dataSource={members}
                    rowKey="id"
                    pagination={{ current: page, pageSize: PAGE_SIZE, total: totalElements, onChange: setPage }}
                    locale={{ emptyText: '회원이 없습니다.' }}
                />
            )}

            {/* key 토글 제거 — SanctionModal이 destroyOnHidden으로 입력값을 초기화하므로
                강제 remount가 필요 없고, 그 덕에 닫힘 애니메이션이 정상 재생된다 */}
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
