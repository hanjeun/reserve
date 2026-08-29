/**
 * RESERVE - 관리자 사업자 인증 탭 (대기 중 / 전체 목록)
 *
 * 2026-07 전수조사로 AdminPanel.jsx에서 분리.
 * 다른 9개 탭(MembersTab, StoresAdminTab, ReservationsAllTab, TrashTab, AuditLogTab,
 * DashboardTab, MailboxTab, AdminAdsTab)은 이미 components/admin/ 아래로 분리돼 있었는데
 * 사업자 인증 탭만 데이터 로딩 + 컬럼 정의 + 상세 모달 + 거절 모달이 전부 AdminPanel에
 * 남아 있어서, AdminPanel이 "탭 셸"이 아니라 "탭 셸 + 한 탭의 전체 구현"이 되어 있었음.
 *
 * mode: 'pending'(대기 중) | 'all'(전체 목록)
 *   두 탭은 같은 queryKey(adminKeys.businessVerifications())를 공유하므로 TanStack Query
 *   캐시 덕에 네트워크 요청은 한 번만 나간다 — 컴포넌트를 두 번 마운트해도 중복 호출 없음.
 *   URL 쿼리스트링(search/page)도 mode별로 별개인 탭 키(tab=pending / tab=all)에서만 쓰이므로
 *   두 인스턴스가 서로의 필터를 덮어쓸 걱정은 없다(AdminPanel의 탭 전환이 항상 ?tab=만 남기고
 *   나머지 파라미터를 지우기 때문).
 *
 * 함께 고친 것 —
 * 1) raw <Table> → 공용 DataTable (size/scroll/pagination 기본값 통일. DataTable을 만든 이유가
 *    바로 이런 불일치 방지인데 정작 AdminPanel이 이걸 안 쓰고 tableProps를 직접 지정하고 있었음)
 * 2) AdminTableSkeleton에 실제 headers/cols 배선 (헤더는 고정 텍스트라 진짜 글자로 노출)
 * 3) RejectModal의 key={rejectOpen ? 'reject-open' : 'reject-closed'} 강제 remount 제거 —
 *    닫는 순간 key가 바뀌며 언마운트돼서 닫힘 애니메이션이 죽던 원인. antd 6의 destroyOnHidden은
 *    "닫힘 애니메이션이 끝난 뒤에" children을 파괴하므로 입력값 초기화 + 애니메이션을 둘 다 얻는다.
 * 4) 로딩 조건을 (isLoading || isFetching)으로 통일
 * 5) 검색어/페이지를 URL 쿼리스트링에 동기화(useQueryParamState) — MembersTab 등과 동일한 이유.
 */
import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Typography, Tag, Modal, Image, Flex } from 'antd';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    CheckOutlined, CloseOutlined, StopOutlined, EyeOutlined, ExclamationCircleFilled,
} from '@ant-design/icons';
import {
    Button, AdminTableSkeleton, FilterToolbar, FormTextArea, FormField, DataTable, ModalLoading,
} from '../common';
import { useMessage, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adminKeys } from '../../hooks/queryKeys';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, radius } from '../../styles/tokens';
import { getDetailImageUrl } from '../../utils';

const { Text, Paragraph } = Typography;

// 파일 내부 전용 상수 — export하면 react-refresh/only-export-components 위반(컴포넌트 외의 것을
// 함께 export하는 파일은 Fast Refresh가 깨짐). 외부에서 쓰는 곳이 없으므로 로컬로 둔다.
const BIZ_STATUS_CONFIG = {
    PENDING:  { color: 'orange', label: '심사 중' },
    APPROVED: { color: 'green',  label: '승인됨' },
    REJECTED: { color: 'red',    label: '거절됨' },
};

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 값을 유지
const SKELETON_HEADERS = ['신청자', '상호명', '사업자번호', '신청일', '상태', '처리'];
const SKELETON_COLS    = [200, 130, 110, 100, 90, 260];
const PAGE_SIZE = 15;
const QUERY_DEFAULTS = { search: '', page: '1' };

// 다른 관리자 탭들과 동일한 2026-07 전수조사 사유 — pagination을 DataTable에 제어시켜서 승인/거절/
// 자격취소 뮤테이션 후 페이지 리셋 버그와, 스켈레톤 로딩 중 페이지 버튼 소멸 문제를 동시에 해결
// (mode='pending'/'all' 각각 독립적인 컴포넌트 인스턴스라 page state도 서로 영향을 주지 않는다).
const skeletonRowCount = (total, pageIdx1, pageSize) => {
    if (!total) return Math.min(8, pageSize);
    const remaining = total - (pageIdx1 - 1) * pageSize;
    return Math.max(1, Math.min(pageSize, remaining));
};

const DetailRow = ({ label, children }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* whiteSpace: nowrap 필수 — 고정 폭 라벨은 폭이 모자라면 글자 단위로 접힌다.
            여기 라벨 중 "사업자등록증"(6자)이 80px에 아슬아슬해서 폰트가 조금만 커져도 두 줄이 된다. */}
        <Text style={{ width: 80, flexShrink: 0, color: colors.text.tertiary, fontSize: fontSize.sm, whiteSpace: 'nowrap' }}>{label}</Text>
        <div style={{ flex: 1 }}>
            {typeof children === 'string'
                ? <Text style={{ fontSize: fontSize.sm, color: colors.text.primary }}>{children}</Text>
                : children}
        </div>
    </div>
);

DetailRow.propTypes = { label: PropTypes.string, children: PropTypes.node };

/**
 * 거절 사유 입력 모달.
 * 입력값(reason) 초기화는 key 토글이 아니라 Modal의 destroyOnHidden이 담당한다 —
 * 그래야 닫힘 애니메이션이 재생될 시간이 확보된다.
 */
const RejectModalBody = ({ target, onChange, error, onErrorClear }) => {
    const [reason, setReason] = useState('');
    onChange(reason);
    return (
        <div style={{ paddingTop: 8 }}>
            <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                &apos;{target?.memberName}&apos; 님의 인증 신청을 거절하는 이유를 입력하세요.
            </Text>
            {/* 미입력 경고를 토스트에서 인라인으로 옮겼다. 모달 위에 뜬 토스트는 몇 초 뒤 사라져서
                "무엇이 잘못됐는지"가 화면에 남지 않는다 — 여기서는 칸 바로 아래에 붙는다. */}
            <FormField error={error}>
                <FormTextArea rows={4} placeholder="예: 사업자등록증 이미지가 불명확합니다."
                    value={reason} onChange={(e) => { setReason(e.target.value); onErrorClear(); }}
                    maxLength={300} showCount />
            </FormField>
        </div>
    );
};

RejectModalBody.propTypes = {
    target: PropTypes.object,
    onChange: PropTypes.func.isRequired,
    error: PropTypes.string,
    onErrorClear: PropTypes.func.isRequired,
};

const RejectModal = ({ open, target, onCancel, onOk, loading }) => {
    const reasonRef = React.useRef('');
    // 오류는 여기(모달)에 둔다. 본문은 destroyOnHidden 으로 매번 새로 마운트되므로
    // 본문에 두면 "거절 처리"를 누른 직후 오류가 화면에 남지 않는다.
    // 대신 닫을 때·보낼 때 명시적으로 지운다 — 이펙트로 지우면 이 레포의
    // react-hooks/set-state-in-effect 규칙에 걸린다.
    const [error, setError] = useState('');

    const handleCancel = () => { setError(''); onCancel(); };
    const handleOk = () => {
        const reason = reasonRef.current?.trim();
        if (!reason) { setError('거절 사유를 입력해주세요.'); return; }
        setError('');
        onOk(reason);
    };

    return (
        <Modal
            title={
                <Flex align="center" gap={8}>
                    <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                    <span>거절 사유 입력</span>
                </Flex>
            }
            open={open}
            onCancel={handleCancel}
            onOk={handleOk}
            /* maskClosable={false}: 사업자 인증 거절 사유를 작성하는 모달 — 바깥 클릭으로 내용 유실 방지.
               컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
               (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
            maskClosable={false}
            okText="거절 처리"
            cancelText="취소"
            okButtonProps={{ danger: true, loading }}
            centered
            destroyOnHidden
        >
            <RejectModalBody target={target} onChange={(v) => { reasonRef.current = v; }}
                error={error} onErrorClear={() => setError('')} />
        </Modal>
    );
};

RejectModal.propTypes = {
    open: PropTypes.bool,
    target: PropTypes.object,
    onCancel: PropTypes.func.isRequired,
    onOk: PropTypes.func.isRequired,
    loading: PropTypes.bool,
};

const BusinessVerificationTab = ({ mode = 'pending' }) => {
    const { message, confirm } = useMessage();
    const queryClient = useQueryClient();

    const [detailItem, setDetailItem]       = useState(null);
    const [detailOpen, setDetailOpen]       = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [rejectTarget, setRejectTarget]   = useState(null);
    const [rejectOpen, setRejectOpen]       = useState(false);
    const [{ search, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const debouncedSearch = useDebounce(search, 300);
    const page = Number(pageStr) || 1;
    const setPage = (p) => setQuery({ page: String(p) });

    const { data, isLoading, isFetching, error, refetch } = useQuery({
        queryKey: adminKeys.businessVerifications(),
        queryFn: async () => {
            const [pending, all] = await Promise.all([
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_PENDING, { params: { page: 0, size: 100 } }),
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_LIST,    { params: { page: 0, size: 100 } }),
            ]);
            return { pending: pending?.content || [], all: all?.content || [] };
        },
    });
    useEffect(() => {
        if (error) message.error('목록을 불러오는데 실패했습니다.');
    }, [error, message]);

    const invalidateBiz = useCallback(
        () => queryClient.invalidateQueries({ queryKey: adminKeys.businessVerifications() }),
        [queryClient]
    );

    const approveMutation = useMutation({
        mutationFn: (id) => api.post(API_ENDPOINTS.BUSINESS.ADMIN_APPROVE(id)),
        onSuccess: () => { message.success('승인되었습니다.'); invalidateBiz(); },
        onError: (err) => message.error(err instanceof Error ? err.message : '승인에 실패했습니다.'),
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }) => api.post(API_ENDPOINTS.BUSINESS.ADMIN_REJECT(id), { reason }),
        onSuccess: () => { message.success('거절 처리되었습니다.'); setRejectOpen(false); invalidateBiz(); },
        onError: (err) => message.error(err instanceof Error ? err.message : '거절 처리에 실패했습니다.'),
    });

    const revokeMutation = useMutation({
        mutationFn: (memberId) => api.post(API_ENDPOINTS.BUSINESS.ADMIN_REVOKE(memberId)),
        onSuccess: () => { message.success('사업자 자격이 취소되었습니다.'); invalidateBiz(); },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'),
    });

    const actionLoading = approveMutation.isPending || rejectMutation.isPending || revokeMutation.isPending;

    const handleApprove = (record) => {
        confirm({
            title: '사업자 인증 승인',
            content: `'${record.memberName}' 님의 사업자 인증을 승인하시겠습니까?`,
            okText: '승인', cancelText: '취소', centered: true,
            onOk: () => approveMutation.mutateAsync(record.id),
        });
    };

    const openRejectModal = (record) => { setRejectTarget(record); setRejectOpen(true); };

    // 빈 사유 검사는 RejectModal 안에서 인라인으로 처리한다 — 여기까지 오면 이미 채워져 있다.
    const handleReject = (reason) => {
        rejectMutation.mutate({ id: rejectTarget.id, reason });
    };

    const handleRevoke = (record) => {
        confirm({
            title: '사업자 자격 취소',
            content: `'${record.memberName}' 님의 사업자 자격을 취소하시겠습니까?`,
            okText: '취소 처리', cancelText: '닫기', okButtonProps: { danger: true }, centered: true,
            onOk: () => revokeMutation.mutateAsync(record.memberId),
        });
    };

    // 코드리뷰 지적사항 반영(2026-07): 예전엔 API 응답을 기다린 뒤에야 모달을 열어서 버튼을 눌러도
    // 몇 초간 아무 반응이 없다가 갑자기 모달이 튀어나왔음 — 모달을 먼저 즉시 열고 내부에 로딩
    // 스피너를 보여준 뒤 데이터가 오면 채우는 방식으로 변경.
    const openDetail = (record) => {
        setDetailItem(null);
        setDetailOpen(true);
        setDetailLoading(true);
        api.get(API_ENDPOINTS.BUSINESS.ADMIN_DETAIL(record.id))
            .then((detail) => setDetailItem(detail))
            .catch(() => { message.error('상세 정보를 불러오지 못했습니다.'); setDetailOpen(false); })
            .finally(() => setDetailLoading(false));
    };

    const filtered = React.useMemo(() => {
        // list 계산을 useMemo 안으로 옮김 — 밖에 두면 (data?.pending ?? [])가 매 렌더 새 배열
        // 레퍼런스를 만들어서 useMemo가 매번 재계산된다(ESLint exhaustive-deps 지적).
        const list = (mode === 'pending' ? data?.pending : data?.all) ?? [];
        if (!debouncedSearch.trim()) return list;
        const kw = debouncedSearch.toLowerCase();
        return list.filter(r =>
            r.memberName?.toLowerCase().includes(kw)
            || r.memberEmail?.toLowerCase().includes(kw)
            || r.businessName?.toLowerCase().includes(kw)
            || r.businessNumber?.includes(kw)
        );
    }, [data, mode, debouncedSearch]);

    // 검색어로 결과가 줄면 존재하지 않는 페이지를 가리킬 수 있어 1로 복귀
    const handleSearchChange = (e) => setQuery({ search: e.target.value, page: '1' });

    const columns = [
        {
            title: '신청자', key: 'member', width: 200,
            render: (_, r) => (
                <div>
                    <Text strong style={{ fontSize: fontSize.sm }}>{r.memberName}</Text>
                    <div style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>{r.memberEmail}</div>
                </div>
            ),
        },
        {
            title: '상호명', dataIndex: 'businessName', key: 'businessName', width: 130,
            ellipsis: { showTitle: false },
            render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text>,
        },
        {
            title: '사업자번호', dataIndex: 'businessNumber', key: 'businessNumber', width: 110,
            render: v => v
                ? <Text code style={{ fontSize: fontSize.xs }}>{v}</Text>
                : <Text type="secondary" style={{ fontSize: fontSize.xs }}>-</Text>,
        },
        {
            title: '신청일', dataIndex: 'createdAt', key: 'createdAt', width: 100,
            render: v => v ? v.substring(0, 10) : '-',
        },
        {
            title: '상태', dataIndex: 'status', key: 'status', width: 90,
            render: status => {
                const cfg = BIZ_STATUS_CONFIG[status] || { color: 'default', label: status };
                return <Tag color={cfg.color}>{cfg.label}</Tag>;
            },
        },
        {
            title: '처리', key: 'actions', width: 260,
            render: (_, r) => (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
                    {r.status === 'PENDING' && (<>
                        <Button variant="ghost-sm-success"
                            loading={approveMutation.isPending && approveMutation.variables === r.id}
                            onClick={() => handleApprove(r)}><CheckOutlined /> 승인</Button>
                        <Button variant="ghost-sm-danger" onClick={() => openRejectModal(r)}><CloseOutlined /> 거절</Button>
                    </>)}
                    {r.status === 'APPROVED' && (
                        <Button variant="ghost-sm-danger"
                            loading={revokeMutation.isPending && revokeMutation.variables === r.memberId}
                            onClick={() => handleRevoke(r)}><StopOutlined /> 자격취소</Button>
                    )}
                    <Button variant="ghost-sm-primary" onClick={() => openDetail(r)}><EyeOutlined /> 상세보기</Button>
                </div>
            ),
        },
    ];

    const emptyText = mode === 'pending' ? '대기 중인 신청이 없습니다.' : '신청 내역이 없습니다.';

    return (
        <>
            <FilterToolbar
                search={{
                    value: search,
                    onChange: handleSearchChange,
                    placeholder: '이름, 이메일, 상호명으로 검색',
                }}
                count={filtered.length}
                onReload={refetch}
                loading={isLoading || isFetching}
            />

            {(isLoading || isFetching) ? (
                <AdminTableSkeleton
                    rows={skeletonRowCount(filtered.length, page, PAGE_SIZE)}
                    cols={SKELETON_COLS}
                    headers={SKELETON_HEADERS}
                    actionBtns={3}
                    stackFirstCol
                    pagination={filtered.length ? { current: page, pageSize: PAGE_SIZE, total: filtered.length } : null}
                />
            ) : (
                <DataTable
                    columns={columns}
                    dataSource={filtered}
                    rowKey="id"
                    pagination={{ current: page, pageSize: PAGE_SIZE, total: filtered.length, onChange: setPage }}
                    locale={{ emptyText }}
                />
            )}

            {/* 사업자 인증 상세 */}
            <Modal
                title="사업자 인증 상세"
                open={detailOpen}
                onCancel={() => setDetailOpen(false)}
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20 }}>
                        {detailItem?.status === 'PENDING' ? (
                            <>
                                <Button variant="ghost-sm-danger"
                                    onClick={() => { setDetailOpen(false); openRejectModal(detailItem); }}>
                                    <CloseOutlined /> 거절
                                </Button>
                                <Button variant="ghost-sm-success" loading={actionLoading}
                                    onClick={() => { setDetailOpen(false); handleApprove(detailItem); }}>
                                    <CheckOutlined /> 승인
                                </Button>
                            </>
                        ) : (
                            /* 모달의 닫기/취소는 테두리 있는 outline으로 통일 (FormModal.jsx의 컨벤션 주석 참고).
                               예전엔 ghost-sm(텍스트형)이라 이 모달만 닫기 버튼이 그냥 글자처럼 보였다. */
                            <Button variant="outline" size="sm" onClick={() => setDetailOpen(false)}
                                style={{ paddingLeft: 20, paddingRight: 20 }}>
                                닫기
                            </Button>
                        )}
                    </div>
                }
                width={560}
                centered
            >
                {detailLoading ? (
                    <ModalLoading text="상세 정보를 불러오는 중..." minHeight="160px" />
                ) : detailItem && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
                        <DetailRow label="신청자">{`${detailItem.memberName} (${detailItem.memberEmail})`}</DetailRow>
                        <DetailRow label="상호명">{detailItem.businessName}</DetailRow>
                        {detailItem.businessNumber && <DetailRow label="사업자번호">{detailItem.businessNumber}</DetailRow>}
                        <DetailRow label="상태">
                            <Tag color={BIZ_STATUS_CONFIG[detailItem.status]?.color}>
                                {BIZ_STATUS_CONFIG[detailItem.status]?.label || detailItem.status}
                            </Tag>
                        </DetailRow>
                        {detailItem.memo && (
                            <DetailRow label="메모">
                                <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', color: colors.text.secondary }}>
                                    {detailItem.memo}
                                </Paragraph>
                            </DetailRow>
                        )}
                        {detailItem.rejectionReason && (
                            <DetailRow label="거절 사유"><Text type="danger">{detailItem.rejectionReason}</Text></DetailRow>
                        )}
                        {detailItem.licenseImageUrl && (
                            <DetailRow label="사업자등록증">
                                <Image src={getDetailImageUrl(detailItem.licenseImageUrl)} alt="사업자등록증"
                                    style={{ maxWidth: '100%', borderRadius: radius.md, marginTop: 4 }}
                                    classNames={{ popup: { root: 'reserve-image-preview' } }} />
                            </DetailRow>
                        )}
                        <DetailRow label="신청일">{detailItem.createdAt?.substring(0, 10)}</DetailRow>
                        {detailItem.processedAt && (
                            <DetailRow label="처리일">
                                {`${detailItem.processedAt?.substring(0, 10)} (${detailItem.processedByName})`}
                            </DetailRow>
                        )}
                    </div>
                )}
            </Modal>

            {/* key 토글 제거 — destroyOnHidden이 입력값 초기화를 담당하므로 닫힘 애니메이션이 살아난다 */}
            <RejectModal
                open={rejectOpen}
                target={rejectTarget}
                onCancel={() => setRejectOpen(false)}
                onOk={handleReject}
                loading={rejectMutation.isPending}
            />
        </>
    );
};

BusinessVerificationTab.propTypes = {
    mode: PropTypes.oneOf(['pending', 'all']),
};

export default BusinessVerificationTab;
