import React, { useState, useEffect, useCallback } from 'react';
import {
    Typography, Tabs, Table, Tag, Modal, Input, Image, Tooltip,
    Select,
} from 'antd';
import {
    SearchOutlined, CalendarOutlined,
    SafetyCertificateOutlined, IdcardOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { PageContainer, Button, AdminTableSkeleton } from '../../components/common';
import { useMessage } from '../../hooks';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';
import { formatTime, formatCurrency } from '../../utils';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const STATUS_CONFIG = {
    PENDING:  { color: 'orange', label: '심사 중' },
    APPROVED: { color: 'green',  label: '승인됨' },
    REJECTED: { color: 'red',    label: '거절됨' },
};

const RES_STATUS_CONFIG = {
    PENDING:   { color: 'orange',  label: '대기 중' },
    CONFIRMED: { color: 'blue',    label: '승인됨' },
    CANCELLED: { color: 'default', label: '취소됨' },
    COMPLETED: { color: 'green',   label: '이용완료' },
    REJECTED:  { color: 'red',     label: '거절됨' },
    NO_SHOW:   { color: 'purple',  label: '노쇼' },
};

const BizSearchBar = ({ value, onChange }) => (
    <Input
        prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
        placeholder="이름, 이메일, 상호명으로 검색"
        value={value}
        onChange={onChange}
        allowClear
        style={{ maxWidth: 320, marginBottom: 16 }}
    />
);

const AdminPanel = () => {
    const { message, confirm } = useMessage();

    const [activeTab, setActiveTab]       = useState('pending');
    const [pendingList, setPendingList]   = useState([]);
    const [allList, setAllList]           = useState([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [loading, setLoading]           = useState(true);

    const [detailItem, setDetailItem] = useState(null);
    const [detailOpen, setDetailOpen] = useState(false);

    const [rejectTarget, setRejectTarget]   = useState(null);
    const [rejectReason, setRejectReason]   = useState('');
    const [rejectOpen, setRejectOpen]       = useState(false);
    const [actionLoading, setActionLoading] = useState(false);

    const [bizSearch, setBizSearch]             = useState('');
    const [resSearch, setResSearch]             = useState('');
    const [resStatusFilter, setResStatusFilter] = useState('ALL');

    const [allReservations, setAllReservations] = useState([]);
    const [resLoading, setResLoading]           = useState(false);
    const [resLoaded, setResLoaded]             = useState(false);

    const loadReservations = useCallback(async (force = false) => {
        if (!force && resLoaded) return;
        setResLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS);
            setAllReservations(Array.isArray(data) ? data : []);
            setResLoaded(true);
        } catch {
            message.error('예약 목록을 불러오지 못했습니다.');
        } finally {
            setResLoading(false);
        }
    }, [message, resLoaded]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [pending, all, count] = await Promise.all([
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_PENDING, { params: { page: 0, size: 100 } }),
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_LIST,    { params: { page: 0, size: 100 } }),
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_PENDING_COUNT),
            ]);
            setPendingList(pending?.content || []);
            setAllList(all?.content || []);
            setPendingCount(typeof count === 'number' ? count : 0);
        } catch {
            message.error('목록을 불러오는데 실패했습니다.');
        } finally {
            setLoading(false);
        }
    }, [message]);

    useEffect(() => { loadData(); }, [loadData]);
    useEffect(() => {
        if (activeTab === 'reservations') loadReservations();
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleApprove = (record) => {
        confirm({
            title: '사업자 인증 승인',
            content: `'${record.memberName}' 님의 사업자 인증을 승인하시겠습니까?`,
            okText: '승인', cancelText: '취소', centered: true,
            onOk: async () => {
                setActionLoading(true);
                try {
                    await api.post(API_ENDPOINTS.BUSINESS.ADMIN_APPROVE(record.id));
                    message.success('승인되었습니다.');
                    await loadData();
                } catch (err) { message.error(err || '승인에 실패했습니다.'); }
                finally { setActionLoading(false); }
            },
        });
    };

    const openRejectModal = (record) => { setRejectTarget(record); setRejectReason(''); setRejectOpen(true); };
    const handleReject = async () => {
        if (!rejectReason.trim()) { message.warning('거절 사유를 입력해주세요.'); return; }
        setActionLoading(true);
        try {
            await api.post(API_ENDPOINTS.BUSINESS.ADMIN_REJECT(rejectTarget.id), { reason: rejectReason });
            message.success('거절 처리되었습니다.');
            setRejectOpen(false);
            await loadData();
        } catch (err) { message.error(err || '거절 처리에 실패했습니다.'); }
        finally { setActionLoading(false); }
    };

    const handleRevoke = (record) => {
        confirm({
            title: '사업자 자격 취소',
            content: `'${record.memberName}' 님의 사업자 자격을 취소하시겠습니까?`,
            okText: '취소 처리', cancelText: '닫기', okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                setActionLoading(true);
                try {
                    await api.post(API_ENDPOINTS.BUSINESS.ADMIN_REVOKE(record.memberId));
                    message.success('사업자 자격이 취소되었습니다.');
                    await loadData();
                } catch (err) { message.error(err || '처리에 실패했습니다.'); }
                finally { setActionLoading(false); }
            },
        });
    };

    const openDetail = async (record) => {
        try {
            const detail = await api.get(API_ENDPOINTS.BUSINESS.ADMIN_DETAIL(record.id));
            setDetailItem(detail);
            setDetailOpen(true);
        } catch { message.error('상세 정보를 불러오지 못했습니다.'); }
    };

    const filterBiz = (list) => {
        if (!bizSearch.trim()) return list;
        const kw = bizSearch.toLowerCase();
        return list.filter(r =>
            r.memberName?.toLowerCase().includes(kw) ||
            r.memberEmail?.toLowerCase().includes(kw) ||
            r.businessName?.toLowerCase().includes(kw) ||
            r.businessNumber?.includes(kw)
        );
    };

    const filteredReservations = React.useMemo(() => {
        let list = resStatusFilter === 'ALL'
            ? allReservations
            : allReservations.filter(r => r.status === resStatusFilter);
        if (resSearch.trim()) {
            const kw = resSearch.toLowerCase();
            list = list.filter(r =>
                r.storeName?.toLowerCase().includes(kw) ||
                r.memberName?.toLowerCase().includes(kw) ||
                r.memberEmail?.toLowerCase().includes(kw)
            );
        }
        return list;
    }, [allReservations, resStatusFilter, resSearch]);

    // ── 사업자 인증 컬럼 ────────────────────────────────────
    const columns = [
        {
            title: '신청자', key: 'member', width: 180,
            render: (_, r) => (
                <div>
                    <Text strong style={{ fontSize: fontSize.sm }}>{r.memberName}</Text>
                    <div style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>{r.memberEmail}</div>
                </div>
            ),
        },
        {
            title: '상호명', dataIndex: 'businessName', key: 'businessName', width: 160,
            ellipsis: { showTitle: false },
            render: (v) => (
                <Tooltip title={v} placement="topLeft">
                    <Text style={{ fontSize: fontSize.sm }}>{v}</Text>
                </Tooltip>
            ),
        },
        {
            title: '사업자번호', dataIndex: 'businessNumber', key: 'businessNumber', width: 120,
            render: (v) => v
                ? <Text code style={{ fontSize: fontSize.xs }}>{v}</Text>
                : <Text type="secondary" style={{ fontSize: fontSize.xs }}>-</Text>,
        },
        {
            title: '신청일', dataIndex: 'createdAt', key: 'createdAt', width: 110,
            render: (v) => v ? v.substring(0, 10) : '-',
        },
        {
            title: '상태', dataIndex: 'status', key: 'status', width: 80,
            render: (status) => {
                const cfg = STATUS_CONFIG[status] || { color: 'default', label: status };
                return <Tag color={cfg.color}>{cfg.label}</Tag>;
            },
        },
        {
            title: '처리', key: 'actions', fixed: 'right', width: 140,
            render: (_, r) => (
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                    {r.status === 'PENDING' && (
                        <>
                            <Button variant="ghost-sm-success" loading={actionLoading} onClick={() => handleApprove(r)}>승인</Button>
                            <Button variant="ghost-sm-danger" onClick={() => openRejectModal(r)}>거절</Button>
                        </>
                    )}
                    {r.status === 'APPROVED' && (
                        <Button variant="ghost-sm-danger" loading={actionLoading} onClick={() => handleRevoke(r)}>자격취소</Button>
                    )}
                    <Button variant="ghost-sm-primary" onClick={() => openDetail(r)}>상세보기</Button>
                </div>
            ),
        },
    ];

    // ── 예약 컬럼 ───────────────────────────────────────────
    const reservationColumns = [
        { title: '가게',  dataIndex: 'storeName',        key: 'storeName',        width: 130, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '예약자', dataIndex: 'memberName',       key: 'memberName',       width: 100, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '날짜',  dataIndex: 'reservationDate',  key: 'reservationDate',  width: 110, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '시간',  dataIndex: 'reservationTime',  key: 'reservationTime',  width: 80,  render: v => <Text style={{ fontSize: fontSize.sm }}>{formatTime(v)}</Text> },
        { title: '인원',  dataIndex: 'guestCount',       key: 'guestCount',       width: 60,  render: v => <Text style={{ fontSize: fontSize.sm }}>{v}명</Text> },
        {
            title: '예약금', dataIndex: 'depositAmount', key: 'depositAmount', width: 90,
            render: (v, r) => (
                <Text style={{ fontSize: fontSize.sm, color: r.depositPaid ? colors.primary.main : colors.text.tertiary }}>
                    {v > 0 ? formatCurrency(v) : '-'}{r.depositPaid ? ' ✓' : ''}
                </Text>
            ),
        },
        {
            title: '상태', dataIndex: 'status', key: 'status', width: 90,
            render: status => {
                const cfg = RES_STATUS_CONFIG[status] || { color: 'default', label: status };
                return <Tag color={cfg.color}>{cfg.label}</Tag>;
            },
        },
    ];

    const tableProps = {
        columns,
        rowKey: 'id',
        size: 'middle',
        scroll: { x: 790 }, // 180+160+120+110+80+140 = 790
        pagination: { pageSize: 15, showSizeChanger: false },
    };

    const tabItems = [
        {
            key: 'pending',
            label: (
                <span style={tabLabelStyle}>
                    <IdcardOutlined />
                    <span>대기 중</span>
                </span>
            ),
            children: (
                <>
                    <BizSearchBar value={bizSearch} onChange={(e) => setBizSearch(e.target.value)} />
                    {loading
                        ? <AdminTableSkeleton rows={8} />
                        : <Table {...tableProps} dataSource={filterBiz(pendingList)} locale={{ emptyText: '대기 중인 신청이 없습니다.' }} />}
                </>
            ),
        },
        {
            key: 'all',
            label: (
                <span style={tabLabelStyle}>
                    <SafetyCertificateOutlined /> 전체 목록
                </span>
            ),
            children: (
                <>
                    <BizSearchBar value={bizSearch} onChange={(e) => setBizSearch(e.target.value)} />
                    {loading
                        ? <AdminTableSkeleton rows={8} />
                        : <Table {...tableProps} dataSource={filterBiz(allList)} locale={{ emptyText: '신청 내역이 없습니다.' }} />}
                </>
            ),
        },
        {
            key: 'reservations',
            label: (
                <span style={tabLabelStyle}>
                    <CalendarOutlined /> 전체 예약
                </span>
            ),
            children: (
                <>
                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
                        <Input
                            prefix={<SearchOutlined style={{ color: colors.text.tertiary }} />}
                            placeholder="가게명, 예약자로 검색"
                            value={resSearch}
                            onChange={(e) => setResSearch(e.target.value)}
                            allowClear
                            style={{ maxWidth: 260 }}
                            disabled={resLoading}
                        />
                        <Select
                            value={resStatusFilter}
                            onChange={setResStatusFilter}
                            style={{ width: 140 }}
                            disabled={resLoading}
                            options={[
                                { value: 'ALL',       label: '전체 상태' },
                                { value: 'PENDING',   label: '대기 중' },
                                { value: 'CONFIRMED', label: '승인됨' },
                                { value: 'CANCELLED', label: '취소됨' },
                                { value: 'COMPLETED', label: '이용완료' },
                                { value: 'REJECTED',  label: '거절됨' },
                                { value: 'NO_SHOW',   label: '노쇼' },
                            ]}
                        />
                        {!resLoading && (
                            <Text type="secondary" style={{ fontSize: fontSize.sm, alignSelf: 'center' }}>
                                총 {filteredReservations.length}건
                            </Text>
                        )}
                        <Button
                            variant="ghost-sm"
                            loading={resLoading}
                            onClick={() => loadReservations(true)}
                            style={{ marginLeft: 'auto' }}
                        >
                            <ReloadOutlined /> 새로고침
                        </Button>
                    </div>
                    {resLoading
                        ? <AdminTableSkeleton rows={8} cols={[130, 100, 110, 80, 60, 90, 90]} />
                        : <Table
                            columns={reservationColumns}
                            dataSource={filteredReservations}
                            rowKey="id"
                            size="middle"
                            scroll={{ x: 'max-content' }}
                            pagination={{ pageSize: 20, showSizeChanger: false }}
                            locale={{ emptyText: '예약 내역이 없습니다.' }}
                        />}
                </>
            ),
        },
    ];

    return (
        <PageContainer size="xl" paddingTop="40px">
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={styles.title}>관리자 패널</Title>
                <Text type="secondary" style={{ fontSize: fontSize.base }}>
                    사업자 인증 신청을 검토하고, 전체 예약 현황을 모니터링하세요.
                </Text>
            </div>

            <Tabs
                activeKey={activeTab}
                onChange={(k) => { setActiveTab(k); setBizSearch(''); setResSearch(''); }}
                items={tabItems}
            />

            {/* 상세 모달 */}
            <Modal
                title="사업자 인증 상세"
                open={detailOpen}
                onCancel={() => setDetailOpen(false)}
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20 }}>
                        {detailItem?.status === 'PENDING' ? (
                            <>
                                <Button variant="ghost-sm-danger" onClick={() => { setDetailOpen(false); openRejectModal(detailItem); }}>거절</Button>
                                <Button variant="ghost-sm-success" loading={actionLoading} onClick={() => { setDetailOpen(false); handleApprove(detailItem); }}>승인</Button>
                            </>
                        ) : (
                            <Button variant="ghost-sm" onClick={() => setDetailOpen(false)}>닫기</Button>
                        )}
                    </div>
                }
                width={560}
                centered
            >
                {detailItem && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
                        <DetailRow label="신청자">{detailItem.memberName} ({detailItem.memberEmail})</DetailRow>
                        <DetailRow label="상호명">{detailItem.businessName}</DetailRow>
                        {detailItem.businessNumber && <DetailRow label="사업자번호">{detailItem.businessNumber}</DetailRow>}
                        <DetailRow label="상태">
                            <Tag color={STATUS_CONFIG[detailItem.status]?.color}>
                                {STATUS_CONFIG[detailItem.status]?.label || detailItem.status}
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
                            <DetailRow label="거절 사유">
                                <Text type="danger">{detailItem.rejectionReason}</Text>
                            </DetailRow>
                        )}
                        {detailItem.licenseImageUrl && (
                            <DetailRow label="사업자등록증">
                                <Image
                                    src={detailItem.licenseImageUrl.startsWith('http')
                                        ? detailItem.licenseImageUrl
                                        : `${window.location.protocol}//${window.location.hostname}:8080${detailItem.licenseImageUrl}`}
                                    alt="사업자등록증"
                                    style={{ maxWidth: '100%', borderRadius: radius.md, marginTop: 4 }}
                                />
                            </DetailRow>
                        )}
                        <DetailRow label="신청일">{detailItem.createdAt?.substring(0, 10)}</DetailRow>
                        {detailItem.processedAt && (
                            <DetailRow label="처리일">
                                {detailItem.processedAt?.substring(0, 10)} ({detailItem.processedByName})
                            </DetailRow>
                        )}
                    </div>
                )}
            </Modal>

            {/* 거절 사유 모달 */}
            <Modal
                title="거절 사유 입력"
                open={rejectOpen}
                onCancel={() => setRejectOpen(false)}
                onOk={handleReject}
                okText="거절 처리"
                cancelText="취소"
                okButtonProps={{ danger: true, loading: actionLoading }}
                centered
            >
                <div style={{ paddingTop: 8 }}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                        '{rejectTarget?.memberName}' 님의 인증 신청을 거절하는 이유를 입력하세요.
                    </Text>
                    <TextArea
                        rows={4}
                        placeholder="예: 사업자등록증 이미지가 불명확합니다."
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        maxLength={300}
                        showCount
                    />
                </div>
            </Modal>
        </PageContainer>
    );
};

const DetailRow = ({ label, children }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Text style={{ width: 80, flexShrink: 0, color: colors.text.tertiary, fontSize: fontSize.sm }}>{label}</Text>
        <div style={{ flex: 1 }}>
            {typeof children === 'string'
                ? <Text style={{ fontSize: fontSize.sm, color: colors.text.primary }}>{children}</Text>
                : children}
        </div>
    </div>
);

const tabLabelStyle = { display: 'inline-flex', alignItems: 'center', gap: 6, lineHeight: 1 };
const tabBadgeStyle = {}; // 미사용
const styles = {
    title: { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary },
};

export default AdminPanel;
