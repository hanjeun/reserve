import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Typography, Tabs, Table, Tag, Modal, Input, Image, Flex,
} from 'antd';
import {
    CalendarOutlined, SafetyCertificateOutlined, IdcardOutlined, MailOutlined,
    DeleteOutlined, FileTextOutlined, BarChartOutlined, TeamOutlined, ShopOutlined,
    ExclamationCircleFilled,
} from '@ant-design/icons';
import MailboxTab from '../../components/admin/MailboxTab';
import TrashTab from '../../components/admin/TrashTab';
import AuditLogTab from '../../components/admin/AuditLogTab';
import DashboardTab from '../../components/admin/DashboardTab';
import MembersTab from '../../components/admin/MembersTab';
import StoresAdminTab from '../../components/admin/StoresAdminTab';
import ReservationsAllTab from '../../components/admin/ReservationsAllTab';
import { PageContainer, Button, AdminTableSkeleton, FilterToolbar } from '../../components/common';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useDebounce from '../../hooks/useDebounce';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';
import { getDetailImageUrl } from '../../utils';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

// 탭 라벨 공통 스타일
const tabLabel = (icon, text) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {icon}{text}
    </span>
);

const STATUS_CONFIG = {
    PENDING:  { color: 'orange', label: '심사 중' },
    APPROVED: { color: 'green',  label: '승인됨' },
    REJECTED: { color: 'red',    label: '거절됨' },
};

/**
 * 관리자 패널.
 * 회원 관리 / 가게 관리 / 전체 예약 탭은 각자 자체 데이터 로딩·모달을 캡슐화한
 * 별도 컴포넌트(MembersTab / StoresAdminTab / ReservationsAllTab)로 분리되어 있음.
 * (Cognitive Complexity 17 → 15 목표로 분리, 각 탭이 antd Tabs에 의해 최초 활성화될 때
 * 마운트되면서 자체 useEffect로 데이터를 불러오므로, 부모가 activeTab을 감시하며
 * 수동으로 로드를 트리거해줄 필요가 없어짐)
 */
const AdminPanel = () => {
    const { message, confirm } = useMessage();
    useDocumentTitle('관리자 패널');
    const navigate = useNavigate();
    const location = useLocation();

    const activeTab = new URLSearchParams(location.search).get('tab') || 'pending';
    const [mailUnread, setMailUnread] = useState(0);

    // 탭 클릭 시 URL만 변경 — 필터 리셋은 아래 useEffect가 담당
    const handleTabChange = (key) => navigate(`?tab=${key}`, { replace: true });

    // activeTab 변경(버튼 클릭 + 브라우저 뒤로가기 공통) 시 사업자 인증 탭 검색어만 초기화
    // (회원/가게/예약 탭의 검색·필터는 각 탭 컴포넌트 내부 상태로 이동해 여기서 관리하지 않음 —
    //  antd Tabs가 마운트된 탭을 유지하므로 탭을 오갈 때 검색어가 유지되는 게 자연스러움)
    useEffect(() => { setBizSearch(''); }, [activeTab]);

    const [pendingList, setPendingList]     = useState([]);
    const [allList, setAllList]             = useState([]);
    const [loading, setLoading]             = useState(true);
    // "최초 1회 로딩 완료" 추적용 ref — 액션 후 강제 재조회와 무관하게 적용되어
    // Table을 한번이라도 렌더한 적 있으면 다시는 절대 스켈레톤으로 돌아가지 않음 (페이지네이션 깜빡임 방지)
    const pendingAllLoadedRef = useRef(false);
    const [detailItem, setDetailItem]       = useState(null);
    const [detailOpen, setDetailOpen]       = useState(false);
    const [rejectTarget, setRejectTarget]   = useState(null);
    const [rejectOpen, setRejectOpen]       = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [bizSearch, setBizSearch]         = useState('');
    const debouncedBizSearch = useDebounce(bizSearch, 300);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [pending, all] = await Promise.all([
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_PENDING, { params: { page: 0, size: 100 } }),
                api.get(API_ENDPOINTS.BUSINESS.ADMIN_LIST,    { params: { page: 0, size: 100 } }),
            ]);
            setPendingList(pending?.content || []);
            setAllList(all?.content || []);
        } catch { message.error('목록을 불러오는데 실패했습니다.'); }
        finally { setLoading(false); pendingAllLoadedRef.current = true; }
    }, [message]);

    useEffect(() => { loadData(); }, [loadData]);

    // NOTE: scrollIntoView 제거 — iOS WebKit(Safari/Chrome)에서 viewport 전체를 수평으로
    // 밀어버리는 버그 원인. Ant Design Tabs는 모바일에서 자체적으로 탭 스크롤을 처리함.

    const handleApprove = (record) => {
        confirm({
            title: '사업자 인증 승인',
            content: `'${record.memberName}' 님의 사업자 인증을 승인하시겠습니까?`,
            okText: '승인', cancelText: '취소', centered: true,
            onOk: async () => {
                setActionLoading(true);
                try { await api.post(API_ENDPOINTS.BUSINESS.ADMIN_APPROVE(record.id)); message.success('승인되었습니다.'); await loadData(); }
                catch (err) { message.error(err instanceof Error ? err.message : '승인에 실패했습니다.'); }
                finally { setActionLoading(false); }
            },
        });
    };

    const openRejectModal = (record) => { setRejectTarget(record); setRejectOpen(true); };
    const handleReject = async (reason) => {
        if (!reason.trim()) { message.warning('거절 사유를 입력해주세요.'); return; }
        setActionLoading(true);
        try { await api.post(API_ENDPOINTS.BUSINESS.ADMIN_REJECT(rejectTarget.id), { reason }); message.success('거절 처리되었습니다.'); setRejectOpen(false); await loadData(); }
        catch (err) { message.error(err instanceof Error ? err.message : '거절 처리에 실패했습니다.'); }
        finally { setActionLoading(false); }
    };

    const handleRevoke = (record) => {
        confirm({
            title: '사업자 자격 취소', content: `'${record.memberName}' 님의 사업자 자격을 취소하시겠습니까?`,
            okText: '취소 처리', cancelText: '닫기', okButtonProps: { danger: true }, centered: true,
            onOk: async () => {
                setActionLoading(true);
                try { await api.post(API_ENDPOINTS.BUSINESS.ADMIN_REVOKE(record.memberId)); message.success('사업자 자격이 취소되었습니다.'); await loadData(); }
                catch (err) { message.error(err instanceof Error ? err.message : '처리에 실패했습니다.'); }
                finally { setActionLoading(false); }
            },
        });
    };

    const openDetail = async (record) => {
        try { const detail = await api.get(API_ENDPOINTS.BUSINESS.ADMIN_DETAIL(record.id)); setDetailItem(detail); setDetailOpen(true); }
        catch { message.error('상세 정보를 불러오지 못했습니다.'); }
    };

    const filterBiz = (list) => {
        if (!debouncedBizSearch.trim()) return list;
        const kw = debouncedBizSearch.toLowerCase();
        return list.filter(r => r.memberName?.toLowerCase().includes(kw) || r.memberEmail?.toLowerCase().includes(kw) || r.businessName?.toLowerCase().includes(kw) || r.businessNumber?.includes(kw));
    };

    // ── 컬럼 정의 (사업자 인증 심사) ─────────────────────────────
    const columns = [
        { title: '신청자', key: 'member', render: (_, r) => (<div><Text strong style={{ fontSize: fontSize.sm }}>{r.memberName}</Text><div style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>{r.memberEmail}</div></div>) },
        { title: '상호명', dataIndex: 'businessName', key: 'businessName', ellipsis: { showTitle: false }, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '사업자번호', dataIndex: 'businessNumber', key: 'businessNumber', width: 110, render: v => v ? <Text code style={{ fontSize: fontSize.xs }}>{v}</Text> : <Text type="secondary" style={{ fontSize: fontSize.xs }}>-</Text> },
        { title: '신청일', dataIndex: 'createdAt', key: 'createdAt', width: 100, render: v => v ? v.substring(0, 10) : '-' },
        { title: '상태', dataIndex: 'status', key: 'status', width: 80, render: status => { const cfg = STATUS_CONFIG[status] || { color: 'default', label: status }; return <Tag color={cfg.color}>{cfg.label}</Tag>; } },
        { title: '처리', key: 'actions', width: 250, render: (_, r) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
                {r.status === 'PENDING' && (<><Button variant="ghost-sm-success" loading={actionLoading} onClick={() => handleApprove(r)}>승인</Button><Button variant="ghost-sm-danger" onClick={() => openRejectModal(r)}>거절</Button></>)}
                {r.status === 'APPROVED' && (<Button variant="ghost-sm-danger" loading={actionLoading} onClick={() => handleRevoke(r)}>자격취소</Button>)}
                <Button variant="ghost-sm-primary" onClick={() => openDetail(r)}>상세보기</Button>
            </div>
        )},
    ];

    const tableProps = { columns, rowKey: 'id', size: 'middle', scroll: { x: 'max-content' }, tableLayout: 'auto', pagination: { pageSize: 15, showSizeChanger: false } };

    const tabItems = [
        {
            key: 'pending',
            label: tabLabel(<IdcardOutlined />, '대기 중'),
            children: (<>
                <FilterToolbar search={{ value: bizSearch, onChange: e => setBizSearch(e.target.value), placeholder: '이름, 이메일, 상호명으로 검색' }} onReload={loadData} loading={loading} />
                {!pendingAllLoadedRef.current && loading ? <AdminTableSkeleton rows={8} /> : <Table {...tableProps} dataSource={filterBiz(pendingList)} locale={{ emptyText: '대기 중인 신청이 없습니다.' }} />}
            </>),
        },
        {
            key: 'all',
            label: tabLabel(<SafetyCertificateOutlined />, '전체 목록'),
            children: (<>
                <FilterToolbar search={{ value: bizSearch, onChange: e => setBizSearch(e.target.value), placeholder: '이름, 이메일, 상호명으로 검색' }} onReload={loadData} loading={loading} />
                {!pendingAllLoadedRef.current && loading ? <AdminTableSkeleton rows={8} /> : <Table {...tableProps} dataSource={filterBiz(allList)} locale={{ emptyText: '신청 내역이 없습니다.' }} />}
            </>),
        },
        {
            key: 'mailbox',
            label: (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <MailOutlined />메일함
                    {mailUnread > 0 && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 9, background: '#f04452', color: '#fff', fontSize: 11, fontWeight: 700, padding: '0 4px', lineHeight: 1 }}>
                            {mailUnread > 99 ? '99+' : mailUnread}
                        </span>
                    )}
                </span>
            ),
            children: <MailboxTab onUnreadCountChange={setMailUnread} />,
        },
        { key: 'trash',      label: tabLabel(<DeleteOutlined />,  '휴지통'),     children: <TrashTab /> },
        { key: 'audit-logs', label: tabLabel(<FileTextOutlined />, '시스템 로그'), children: <AuditLogTab /> },
        { key: 'dashboard',  label: tabLabel(<BarChartOutlined />, '대시보드'),   children: <DashboardTab /> },
        { key: 'members',      label: tabLabel(<TeamOutlined />, '회원 관리'), children: <MembersTab /> },
        { key: 'stores-admin', label: tabLabel(<ShopOutlined />,  '가게 관리'), children: <StoresAdminTab /> },
        { key: 'reservations', label: tabLabel(<CalendarOutlined />, '전체 예약'), children: <ReservationsAllTab /> },
    ];

    return (
        <PageContainer size="xl" paddingTop="40px">
            <div style={{ marginBottom: 40 }}>
                <Title level={2} style={styles.title}>관리자 패널</Title>
                <Text type="secondary" style={{ fontSize: fontSize.base }}>사업자 인증 신청을 검토하고, 전체 예약 현황을 모니터링하세요.</Text>
            </div>
            {/* ref 및 scrollIntoView 제거 — iOS WebKit 수평 viewport 밀림 버그 방지 */}
            <Tabs activeKey={activeTab} onChange={handleTabChange} items={tabItems}
                animated={{ inkBar: true, tabPane: false }} />

            <Modal title="사업자 인증 상세" open={detailOpen} onCancel={() => setDetailOpen(false)}
                footer={<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 20 }}>
                    {detailItem?.status === 'PENDING' ? (<><Button variant="ghost-sm-danger" onClick={() => { setDetailOpen(false); openRejectModal(detailItem); }}>거절</Button><Button variant="ghost-sm-success" loading={actionLoading} onClick={() => { setDetailOpen(false); handleApprove(detailItem); }}>승인</Button></>) : (<Button variant="ghost-sm" onClick={() => setDetailOpen(false)}>닫기</Button>)}
                </div>} width={560} centered>
                {detailItem && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
                        <DetailRow label="신청자">{detailItem.memberName} ({detailItem.memberEmail})</DetailRow>
                        <DetailRow label="상호명">{detailItem.businessName}</DetailRow>
                        {detailItem.businessNumber && <DetailRow label="사업자번호">{detailItem.businessNumber}</DetailRow>}
                        <DetailRow label="상태"><Tag color={STATUS_CONFIG[detailItem.status]?.color}>{STATUS_CONFIG[detailItem.status]?.label || detailItem.status}</Tag></DetailRow>
                        {detailItem.memo && <DetailRow label="메모"><Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', color: colors.text.secondary }}>{detailItem.memo}</Paragraph></DetailRow>}
                        {detailItem.rejectionReason && <DetailRow label="거절 사유"><Text type="danger">{detailItem.rejectionReason}</Text></DetailRow>}
                        {detailItem.licenseImageUrl && <DetailRow label="사업자등록증"><Image src={getDetailImageUrl(detailItem.licenseImageUrl)} alt="사업자등록증" style={{ maxWidth: '100%', borderRadius: radius.md, marginTop: 4 }} /></DetailRow>}
                        <DetailRow label="신청일">{detailItem.createdAt?.substring(0, 10)}</DetailRow>
                        {detailItem.processedAt && <DetailRow label="처리일">{detailItem.processedAt?.substring(0, 10)} ({detailItem.processedByName})</DetailRow>}
                    </div>
                )}
            </Modal>

            <RejectModal key={rejectOpen ? 'reject-open' : 'reject-closed'} open={rejectOpen} target={rejectTarget}
                onCancel={() => setRejectOpen(false)}
                onOk={handleReject} loading={actionLoading} />
        </PageContainer>
    );
};

const DetailRow = ({ label, children }) => (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Text style={{ width: 80, flexShrink: 0, color: colors.text.tertiary, fontSize: fontSize.sm }}>{label}</Text>
        <div style={{ flex: 1 }}>{typeof children === 'string' ? <Text style={{ fontSize: fontSize.sm, color: colors.text.primary }}>{children}</Text> : children}</div>
    </div>
);

const styles = { title: { fontWeight: fontWeight.extrabold, margin: '0 0 8px', color: colors.text.primary } };

const RejectModal = ({ open, target, onCancel, onOk, loading }) => {
    const [reason, setReason] = useState('');
    return (
        <Modal title={
            <Flex align="center" gap={8}>
                <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                <span>거절 사유 입력</span>
            </Flex>
        } open={open} onCancel={onCancel}
            onOk={() => onOk(reason)} okText="거절 처리" cancelText="취소"
            okButtonProps={{ danger: true, loading }} centered>
            <div style={{ paddingTop: 8 }}>
                <Text type="secondary" style={{ display: 'block', marginBottom: 10 }}>
                    &apos;{target?.memberName}&apos; 님의 인증 신청을 거절하는 이유를 입력하세요.
                </Text>
                <TextArea rows={4} placeholder="예: 사업자등록증 이미지가 불명확합니다." value={reason}
                    onChange={e => setReason(e.target.value)} maxLength={300} showCount />
            </div>
        </Modal>
    );
};

export default AdminPanel;
