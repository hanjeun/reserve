/**
 * 사업자 인증의 대기·전체 목록을 mode별 서버 검색·페이지 조회로 표시한다.
 * 쿼리 키에 mode·페이지·지연 검색어를 포함해 서로 다른 목록의 캐시가 섞이지 않게 한다.
 * 최초·쿼리 전환 로딩에는 실제 열 규격의 스켈레톤을 사용하고 수동 새로고침은 기존 행을 유지한다.
 * 승인·거절·자격 취소 후 관련 조회를 무효화하며 모달은 닫힘 애니메이션 후 내용을 정리한다.
 */
import React, { useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Typography, Tag, Flex } from 'antd';
import LoadingAntImage from '../common/LoadingAntImage';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
    CheckOutlined, CloseOutlined, StopOutlined, EyeOutlined, ExclamationCircleFilled,
} from '../common/icons';
import {
    Button, AdminTableSkeleton, DataState, FilterToolbar, FormTextArea, FormField, DataTable, ModalLoading,
} from '../common';
import { ModalActionGroup } from '../common/ModalActions';
import ResponsiveModal from '../common/ResponsiveModal';
import useWorkspaceDraftGuard from '../../hooks/useWorkspaceDraftGuard';
import { useMessage, useQueryParamsState } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import { adminKeys } from '../../hooks/queryKeys';
import { invalidateAdminData } from '../../hooks/invalidateAfterWrite';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, radius } from '../../styles/tokens';
import { getDetailImageUrl } from '../../utils';
import {
    BUSINESS_VERIFICATION_SKELETON_COLS,
    BUSINESS_VERIFICATION_SKELETON_HEADERS,
    BUSINESS_VERIFICATION_SKELETON_ROWS,
} from './businessVerificationSkeleton';

const { Text, Paragraph } = Typography;

// 파일 내부 전용 상수 — export하면 react-refresh/only-export-components 위반(컴포넌트 외의 것을
// 함께 export하는 파일은 Fast Refresh가 깨짐). 외부에서 쓰는 곳이 없으므로 로컬로 둔다.
const BIZ_STATUS_CONFIG = {
    PENDING:  { color: 'orange', label: '심사 중' },
    APPROVED: { color: 'green',  label: '승인됨' },
    REJECTED: { color: 'red',    label: '거절됨' },
};

// 스켈레톤이 실제 테이블과 1:1로 대응하도록 컬럼 정의와 같은 값을 유지(관리자 패널 청크 로딩 뼈대와 공유)
const SKELETON_HEADERS = [...BUSINESS_VERIFICATION_SKELETON_HEADERS];
const SKELETON_COLS    = [...BUSINESS_VERIFICATION_SKELETON_COLS];
const PAGE_SIZE = 15;
const QUERY_DEFAULTS = { search: '', page: '1' };

// 다른 관리자 탭들과 동일한 2026-07 전수조사 사유 — pagination을 DataTable에 제어시켜서 승인/거절/
// 자격취소 뮤테이션 후 페이지 리셋 버그와, 스켈레톤 로딩 중 페이지 버튼 소멸 문제를 동시에 해결
// (mode='pending'/'all' 각각 독립적인 컴포넌트 인스턴스라 page state도 서로 영향을 주지 않는다).
const skeletonRowCount = (total, pageIdx1, pageSize) => {
    if (!total) return Math.min(BUSINESS_VERIFICATION_SKELETON_ROWS, pageSize);
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
                <FormTextArea rows={4} placeholder="예: 사업자등록증 이미지가 잘 보이지 않아요."
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
    const requestClose = useWorkspaceDraftGuard({ dirty: () => open && Boolean(reasonRef.current), busy: open && loading, onDiscard: handleCancel });
    const handleOk = () => {
        const reason = reasonRef.current?.trim();
        if (!reason) { setError('거절 사유를 입력해주세요.'); return; }
        setError('');
        onOk(reason);
    };

    return (
        <ResponsiveModal mobileSheet={false}
            title={
                <Flex align="center" gap={8}>
                    <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                    <span>거절 사유 입력</span>
                </Flex>
            }
            open={open}
            onCancel={() => requestClose(handleCancel, { discard: false })}
            onOk={handleOk}
            /* mask.closable=false: 사업자 인증 거절 사유를 작성하는 모달 — 바깥 클릭으로 내용 유실 방지.
               컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
               (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
            mask={{ closable: false }}
            okText="거절 처리"
            cancelText="취소"
            okButtonProps={{ danger: true, loading }}
            centered
            destroyOnHidden
        >
            <RejectModalBody target={target} onChange={(v) => { reasonRef.current = v; }}
                error={error} onErrorClear={() => setError('')} />
        </ResponsiveModal>
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
    const [detailError, setDetailError]     = useState(null);
    const [detailRequestId, setDetailRequestId] = useState(null);
    const detailRequestRef = React.useRef(0);
    const [rejectTarget, setRejectTarget]   = useState(/** @type {{id: number, memberName: string} | null} */ (null));
    const [rejectOpen, setRejectOpen]       = useState(false);
    const [{ search, page: pageStr }, setQuery] = useQueryParamsState(QUERY_DEFAULTS);
    const debouncedSearch = useDebounce(search, 300);
    const page = Number(pageStr) || 1;
    const setPage = (p) => setQuery({ page: String(p) });

    const { data, isLoading, isFetching, isPlaceholderData, error, refetch } = useQuery({
        queryKey: [...adminKeys.businessVerifications(), mode, page, debouncedSearch],
        queryFn: async () => {
            const endpoint = mode === 'pending'
                ? API_ENDPOINTS.BUSINESS.ADMIN_PENDING
                : API_ENDPOINTS.BUSINESS.ADMIN_LIST;
            const result = await api.get(endpoint, {
                params: {
                    page: page - 1,
                    size: PAGE_SIZE,
                    ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
                },
            });
            return {
                items: result?.content ?? [],
                totalElements: result?.page?.totalElements ?? result?.totalElements ?? 0,
            };
        },
        placeholderData: keepPreviousData,
    });
    const items = data?.items ?? [];
    const totalElements = data?.totalElements ?? 0;

    // 승인·거절·취소는 회원의 권한(회원 탭)과 감사 로그도 바꾼다 — 관리자 캐시 전체를 무효화한다.
    const invalidateBiz = useCallback(
        () => invalidateAdminData(queryClient),
        [queryClient]
    );

    const approveMutation = useMutation({
        mutationFn: (id) => api.post(API_ENDPOINTS.BUSINESS.ADMIN_APPROVE(id)),
        onSuccess: () => { message.success('승인됐어요.'); void invalidateBiz(); },
        onError: (err) => message.error(err instanceof Error ? err.message : '승인에 실패했어요.'),
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }) => api.post(API_ENDPOINTS.BUSINESS.ADMIN_REJECT(id), { reason }),
        onSuccess: () => { message.success('거절 처리됐어요.'); setRejectOpen(false); void invalidateBiz(); },
        onError: (err) => message.error(err instanceof Error ? err.message : '거절 처리에 실패했어요.'),
    });

    const revokeMutation = useMutation({
        mutationFn: (memberId) => api.post(API_ENDPOINTS.BUSINESS.ADMIN_REVOKE(memberId)),
        onSuccess: () => { message.success('사업자 자격이 취소됐어요.'); void invalidateBiz(); },
        onError: (err) => message.error(err instanceof Error ? err.message : '처리에 실패했어요.'),
    });

    const actionLoading = approveMutation.isPending || rejectMutation.isPending || revokeMutation.isPending;

    const handleApprove = (record) => {
        confirm({
            title: '사업자 인증 승인',
            content: `'${record.memberName}' 님의 사업자 인증을 승인할까요?`,
            okText: '승인', cancelText: '취소', centered: true,
            onOk: () => approveMutation.mutateAsync(record.id),
        });
    };

    const openRejectModal = (record) => { setRejectTarget(record); setRejectOpen(true); };

    // 빈 사유 검사는 RejectModal 안에서 인라인으로 처리한다 — 여기까지 오면 이미 채워져 있다.
    const handleReject = (reason) => {
        if (!rejectTarget) return;
        rejectMutation.mutate({ id: rejectTarget.id, reason });
    };

    const handleRevoke = (record) => {
        confirm({
            title: '사업자 자격 취소',
            content: `'${record.memberName}' 님의 사업자 자격을 취소할까요?`,
            okText: '취소 처리', cancelText: '닫기', okButtonProps: { danger: true }, centered: true,
            onOk: () => revokeMutation.mutateAsync(record.memberId),
        });
    };

    const loadDetail = useCallback((id, { retainError = false } = {}) => {
        const requestId = ++detailRequestRef.current;
        setDetailLoading(true);
        if (!retainError) setDetailError(null);
        return api.get(API_ENDPOINTS.BUSINESS.ADMIN_DETAIL(id))
            .then((detail) => {
                if (requestId !== detailRequestRef.current) return;
                setDetailItem(detail);
                setDetailError(null);
            })
            .catch((error) => {
                if (requestId !== detailRequestRef.current) return;
                setDetailItem(null);
                setDetailError(error);
            })
            .finally(() => {
                if (requestId === detailRequestRef.current) setDetailLoading(false);
            });
    }, []);

    // 모달을 먼저 열어 기다리는 상태를 즉시 보여 주고, 실패해도 닫지 않는다. 그래야 왜 실패했는지
    // 확인하고 같은 대상만 다시 조회할 수 있다.
    const openDetail = (record) => {
        setDetailItem(null);
        setDetailRequestId(record.id);
        setDetailOpen(true);
        void loadDetail(record.id);
    };

    // 검색은 서버 전체 신청 집합에서 수행한다. 검색어 변경 시 페이지를 초기화한다.
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

    const emptyText = mode === 'pending' ? '대기 중인 신청이 없어요.' : '신청 내역이 없어요.';

    // 목록 영역 — 오류 / 첫 로딩·페이지 전환 스켈레톤 / 표
    let tableBody;
    if (error) {
        tableBody = (
            <DataState state="error" kind="member" subject="사업자 인증 신청" error={error}
                onRetry={refetch} retrying={isFetching} />
        );
    } else if (isLoading || isPlaceholderData) {
        tableBody = (
            <AdminTableSkeleton
                rows={skeletonRowCount(totalElements, page, PAGE_SIZE)}
                cols={SKELETON_COLS}
                headers={SKELETON_HEADERS}
                actionBtns={3}
                stackFirstCol
                pagination={totalElements ? { current: page, pageSize: PAGE_SIZE, total: totalElements } : null}
            />
        );
    } else {
        tableBody = (
            <DataTable
                columns={columns}
                dataSource={items}
                rowKey="id"
                pagination={{ current: page, pageSize: PAGE_SIZE, total: totalElements, onChange: setPage }}
                locale={{ emptyText }}
            />
        );
    }

    // 상세 모달 본문 — 로딩 / 오류 / 상세(항목이 없으면 비움)
    let detailBody;
    if (detailLoading && !detailError) {
        detailBody = (
            <ModalLoading text="상세 정보를 불러오는 중..." minHeight="160px" />
        );
    } else if (detailError) {
        detailBody = (
            <DataState
                state="error"
                kind="member"
                subject="사업자 인증 상세"
                error={detailError}
                title="상세 정보를 불러오지 못했어요."
                onRetry={detailRequestId ? () => loadDetail(detailRequestId, { retainError: true }) : undefined}
                retrying={detailLoading}
                style={{ minHeight: 160, margin: 0 }}
            />
        );
    } else {
        detailBody = detailItem && (
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
                        <LoadingAntImage src={getDetailImageUrl(detailItem.licenseImageUrl)} alt="사업자등록증"
                            styles={{ root: { maxWidth: '100%', borderRadius: radius.md, marginTop: 4, overflow: 'hidden', lineHeight: 0 } }}
                            style={{ maxWidth: '100%', borderRadius: 'inherit', display: 'block' }}
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
        );
    }

    return (
        <>
            <FilterToolbar
                search={{
                    value: search,
                    onChange: handleSearchChange,
                    placeholder: '이름, 이메일, 상호명으로 검색',
                }}
                count={totalElements}
                onReload={refetch}
                loading={isLoading || isFetching}
                initialLoading={isLoading}
            />

            {tableBody}

            {/* 사업자 인증 상세 */}
            <ResponsiveModal
                title="사업자 인증 상세"
                open={detailOpen}
                onCancel={() => setDetailOpen(false)}
                footer={
                    <ModalActionGroup>
                        {detailItem?.status === 'PENDING' ? (
                            <>
                                <Button variant="outline" size="sm" style={{ color: colors.error.main, borderColor: colors.error.main }}
                                    onClick={() => { setDetailOpen(false); openRejectModal(detailItem); }}>
                                    <CloseOutlined /> 거절
                                </Button>
                                <Button variant="outline" size="sm" loading={actionLoading} style={{ color: colors.success.main, borderColor: colors.success.main }}
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
                    </ModalActionGroup>
                }
                width={560}
                mobileSize="tall"
                centered
            >
                {detailBody}
            </ResponsiveModal>

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
