import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Typography, Tabs, Table, Tag, Modal, Input, Image, Tooltip, InputNumber,
} from 'antd';
import {
    CalendarOutlined, SafetyCertificateOutlined, IdcardOutlined, MailOutlined,
    DeleteOutlined, FileTextOutlined, BarChartOutlined, TeamOutlined, ShopOutlined,
} from '@ant-design/icons';
import MailboxTab from '../../components/admin/MailboxTab';
import TrashTab from '../../components/admin/TrashTab';
import AuditLogTab from '../../components/admin/AuditLogTab';
import DashboardTab from '../../components/admin/DashboardTab';
import { PageContainer, Button, AdminTableSkeleton, FilterToolbar } from '../../components/common';
import { useMessage } from '../../hooks';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import useDebounce from '../../hooks/useDebounce';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize, fontWeight, radius } from '../../styles/tokens';
import { formatTime, formatCurrency, getDetailImageUrl } from '../../utils';

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

const RES_STATUS_CONFIG = {
    PENDING:   { color: 'orange',  label: '대기 중' },
    CONFIRMED: { color: 'blue',    label: '승인됨' },
    CANCELLED: { color: 'default', label: '취소됨' },
    COMPLETED: { color: 'green',   label: '이용완료' },
    REJECTED:  { color: 'red',     label: '거절됨' },
    NO_SHOW:   { color: 'purple',  label: '노쇼' },
};

const MEMBER_STATUS_CONFIG = {
    ACTIVE:    { color: 'green',  label: '정상' },
    SUSPENDED: { color: 'orange', label: '정지' },
    BANNED:    { color: 'red',    label: '영구정지' },
};

const AdminPanel = () => {
    const { message, confirm } = useMessage();
    useDocumentTitle('관리자 패널');
    const navigate = useNavigate();
    const location = useLocation();

    const activeTab = new URLSearchParams(location.search).get('tab') || 'pending';
    const [mailUnread, setMailUnread] = useState(0);

    // 탭 클릭 시 URL만 변경 — 필터 리셋은 아래 useEffect가 담당
    const handleTabChange = (key) => navigate(`?tab=${key}`, { replace: true });

    // activeTab 변경(버튼 클릭 + 브라우저 뒤로가기 공통) 시 필터 상태 초기화
    useEffect(() => {
        setBizSearch('');
        setResSearch('');
        setResStatusFilter('ALL');
        setMemberSearch('');
        setStoreSearch('');
    }, [activeTab]);

    const [pendingList, setPendingList]     = useState([]);
    const [allList, setAllList]             = useState([]);
    const [loading, setLoading]             = useState(true);
    // 각 섹션별 "최초 1회 로딩 완료" 추적용 ref — 액션 후 강제 재조회(xLoaded=false)와 무관하게 적용되어
    // Table을 한번이라도 렌더한 적 있으면 다시는 절대 스켈레톤으로 돌아가지 않음 (페이지네이션 깜빡임 방지)
    const pendingAllLoadedRef = useRef(false);
    const memberFirstLoadRef  = useRef(false);
    const storeFirstLoadRef   = useRef(false);
    const resFirstLoadRef     = useRef(false);
    const [detailItem, setDetailItem]       = useState(null);
    const [detailOpen, setDetailOpen]       = useState(false);
    const [rejectTarget, setRejectTarget]   = useState(null);
    const [rejectOpen, setRejectOpen]       = useState(false);
    const [actionLoading, setActionLoading] = useState(false);
    const [bizSearch, setBizSearch]         = useState('');
    const [resSearch, setResSearch]         = useState('');
    const [resStatusFilter, setResStatusFilter] = useState('ALL');
    const debouncedBizSearch = useDebounce(bizSearch, 300);
    const debouncedResSearch = useDebounce(resSearch, 300);

    const [allReservations, setAllReservations] = useState([]);
    const [resLoading, setResLoading]   = useState(false);
    const [resLoaded, setResLoaded]     = useState(false);
    const [members, setMembers]         = useState([]);
    const [memberLoading, setMemberLoading] = useState(false);
    const [memberLoaded, setMemberLoaded]   = useState(false);
    const [stores, setStores]           = useState([]);
    const [storeLoading, setStoreLoading] = useState(false);
    const [storeLoaded, setStoreLoaded]   = useState(false);
    const [memberSearch, setMemberSearch] = useState('');
    const [storeSearch, setStoreSearch]   = useState('');
    const debouncedMemberSearch = useDebounce(memberSearch, 300);
    const debouncedStoreSearch  = useDebounce(storeSearch, 300);

    const filteredMembers = React.useMemo(() => {
        if (!debouncedMemberSearch.trim()) return members;
        const kw = debouncedMemberSearch.toLowerCase();
        return members.filter(m => m.name?.toLowerCase().includes(kw) || m.email?.toLowerCase().includes(kw));
    }, [members, debouncedMemberSearch]);

    const filteredStores = React.useMemo(() => {
        if (!debouncedStoreSearch.trim()) return stores;
        const kw = debouncedStoreSearch.toLowerCase();
        return stores.filter(s => s.name?.toLowerCase().includes(kw) || s.address?.toLowerCase().includes(kw));
    }, [stores, debouncedStoreSearch]);

    const [storeSanctionTarget, setStoreSanctionTarget] = useState(null);
    const [storeSuspendOpen, setStoreSuspendOpen]       = useState(false);
    const [storeBanOpen, setStoreBanOpen]               = useState(false);
    const [storeSanctionLoading, setStoreSanctionLoading] = useState(false);

    const [sanctionTarget, setSanctionTarget]   = useState(null);
    const [suspendOpen, setSuspendOpen]         = useState(false);
    const [banOpen, setBanOpen]                 = useState(false);
    const [sanctionLoading, setSanctionLoading] = useState(false);

    const loadReservations = useCallback(async (force = false) => {
        if (!force && resLoaded) return;
        setResLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.RESERVATION.STORE_RESERVATIONS, { params: { page: 0, size: 100 } });
            setAllReservations(Array.isArray(data) ? data : (data?.content ?? []));
            setResLoaded(true);
        } catch { message.error('예약 목록을 불러오지 못했습니다.'); }
        finally { setResLoading(false); resFirstLoadRef.current = true; }
    }, [message, resLoaded]);

    const loadMembers = useCallback(async (force = false) => {
        if (!force && memberLoaded) return;
        setMemberLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.ADMIN_MANAGE.MEMBERS, { params: { page: 0, size: 100 } });
            setMembers(data?.content ?? []);
            setMemberLoaded(true);
        } catch { message.error('회원 목록을 불러오지 못했습니다.'); }
        finally { setMemberLoading(false); memberFirstLoadRef.current = true; }
    }, [message, memberLoaded]);

    const loadStores = useCallback(async (force = false) => {
        if (!force && storeLoaded) return;
        setStoreLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.ADMIN_MANAGE.STORES, { params: { page: 0, size: 100 } });
            setStores(data?.content ?? []);
            setStoreLoaded(true);
        } catch { message.error('가게 목록을 불러오지 못했습니다.'); }
        finally { setStoreLoading(false); storeFirstLoadRef.current = true; }
    }, [message, storeLoaded]);

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
    useEffect(() => {
        if (activeTab === 'reservations') loadReservations();
        if (activeTab === 'members') loadMembers();
        if (activeTab === 'stores-admin') loadStores();
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

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

    const softDeleteConfirm = (title, content, onOk) => confirm({ title, content, okText: '삭제', cancelText: '취소', okButtonProps: { danger: true }, centered: true, onOk });

    const handleSoftDeleteReservation = (r) => softDeleteConfirm('예약 휴지통으로 이동', `예약 #${r.id}을 휴지통으로 이동하시겠습니까?`, async () => {
        try { await api.delete(API_ENDPOINTS.ADMIN_MANAGE.RESERVATION_DELETE(r.id)); message.success('휴지통으로 이동되었습니다.'); await loadReservations(true); }
        catch { message.error('삭제에 실패했습니다.'); }
    });

    // 가게 제재 핸들러
    const handleStoreSuspend = async (days, reason) => {
        if (!storeSanctionTarget) return;
        setStoreSanctionLoading(true);
        try {
            await api.post(API_ENDPOINTS.ADMIN_MANAGE.STORE_SUSPEND(storeSanctionTarget.id), { days: String(days), reason: reason || '' });
            message.success(`${days}일간 영업정지 처리되었습니다.`);
            setStoreSuspendOpen(false);
            setStoreLoaded(false);
            await loadStores(true);
        } catch { message.error('영업정지 처리에 실패했습니다.'); }
        finally { setStoreSanctionLoading(false); }
    };

    const handleStoreBan = async (reason) => {
        if (!storeSanctionTarget) return;
        setStoreSanctionLoading(true);
        try {
            await api.post(API_ENDPOINTS.ADMIN_MANAGE.STORE_BAN(storeSanctionTarget.id), { reason: reason || '' });
            message.success('영구 폐업 처리되었습니다.');
            setStoreBanOpen(false);
            setStoreLoaded(false);
            await loadStores(true);
        } catch { message.error('영구 폐업 처리에 실패했습니다.'); }
        finally { setStoreSanctionLoading(false); }
    };

    const handleStoreUnban = async (storeId) => {
        try {
            await api.post(API_ENDPOINTS.ADMIN_MANAGE.STORE_UNBAN(storeId));
            message.success('영업정지가 해제되었습니다.');
            setStoreLoaded(false);
            await loadStores(true);
        } catch { message.error('해제에 실패했습니다.'); }
    };

    const handleSuspend = async (days, reason) => {
        if (!sanctionTarget) return;
        setSanctionLoading(true);
        try {
            await api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_SUSPEND(sanctionTarget.id), { days: String(days), reason: reason || '' });
            message.success(`${days}일간 정지 처리되었습니다.`); setSuspendOpen(false); setMemberLoaded(false); await loadMembers(true);
        } catch { message.error('정지 처리에 실패했습니다.'); }
        finally { setSanctionLoading(false); }
    };

    const handleBan = async (reason) => {
        if (!sanctionTarget) return;
        setSanctionLoading(true);
        try {
            await api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_BAN(sanctionTarget.id), { reason: reason || '' });
            message.success('영구 정지 처리되었습니다.'); setBanOpen(false); setMemberLoaded(false); await loadMembers(true);
        } catch { message.error('영구 정지에 실패했습니다.'); }
        finally { setSanctionLoading(false); }
    };

    const filterBiz = (list) => {
        if (!debouncedBizSearch.trim()) return list;
        const kw = debouncedBizSearch.toLowerCase();
        return list.filter(r => r.memberName?.toLowerCase().includes(kw) || r.memberEmail?.toLowerCase().includes(kw) || r.businessName?.toLowerCase().includes(kw) || r.businessNumber?.includes(kw));
    };

    const filteredReservations = React.useMemo(() => {
        let list = resStatusFilter === 'ALL' ? allReservations : allReservations.filter(r => r.status === resStatusFilter);
        if (debouncedResSearch.trim()) {
            const kw = debouncedResSearch.toLowerCase();
            list = list.filter(r => r.storeName?.toLowerCase().includes(kw) || r.memberName?.toLowerCase().includes(kw) || r.memberEmail?.toLowerCase().includes(kw));
        }
        return list;
    }, [allReservations, resStatusFilter, debouncedResSearch]);

    // ── 컬럼 정의 ─────────────────────────────────────────
    const columns = [
        { title: '신청자', key: 'member', render: (_, r) => (<div><Text strong style={{ fontSize: fontSize.sm }}>{r.memberName}</Text><div style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}>{r.memberEmail}</div></div>) },
        { title: '상호명', dataIndex: 'businessName', key: 'businessName', ellipsis: { showTitle: false }, render: v => <Tooltip title={v} placement="topLeft"><Text style={{ fontSize: fontSize.sm }}>{v}</Text></Tooltip> },
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

    const reservationColumns = [
        { title: '가게',  dataIndex: 'storeName',       key: 'storeName',       width: 130, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '예약자', dataIndex: 'memberName',      key: 'memberName',      width: 100, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '날짜',  dataIndex: 'reservationDate', key: 'reservationDate', width: 110, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '시간',  dataIndex: 'reservationTime', key: 'reservationTime', width: 80,  render: v => <Text style={{ fontSize: fontSize.sm }}>{formatTime(v)}</Text> },
        { title: '인원',  dataIndex: 'guestCount',      key: 'guestCount',      width: 60,  render: v => <Text style={{ fontSize: fontSize.sm }}>{v}명</Text> },
        { title: '예약금', dataIndex: 'depositAmount',  key: 'depositAmount',   width: 90,  render: (v, r) => <Text style={{ fontSize: fontSize.sm, color: r.depositPaid ? colors.primary?.main : colors.text.tertiary }}>{v > 0 ? formatCurrency(v) : '-'}{r.depositPaid ? ' ✓' : ''}</Text> },
        { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: status => { const cfg = RES_STATUS_CONFIG[status] || { color: 'default', label: status }; return <Tag color={cfg.color}>{cfg.label}</Tag>; } },
        { title: '처리', key: 'actions', width: 80, render: (_, r) => <Button variant="ghost-sm-danger" onClick={() => handleSoftDeleteReservation(r)}><DeleteOutlined /> 삭제</Button> },
    ];

    // SonarCloud: 중첩 삼항 + 중첩 템플릿 리터럴 해소 — 헬퍼 함수로 추출
    const getSuspendTooltip = (r) => {
        if (!r.suspendReason) return '';
        const until = r.suspendedUntil ? ` (~${r.suspendedUntil})` : '';
        return `사유: ${r.suspendReason}${until}`;
    };

    const memberColumns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60, render: v => <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>{v}</Text> },
        { title: '이름', dataIndex: 'name', key: 'name', width: 100, render: v => <Text style={{ fontSize: fontSize.sm }}>{v || '-'}</Text> },
        { title: '이메일', dataIndex: 'email', key: 'email', width: 220, ellipsis: true, render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '권한', dataIndex: 'role', key: 'role', width: 90, render: v => <Tag color={v === 'ADMIN' ? 'red' : v === 'BUSINESS' ? 'blue' : 'default'}>{v}</Tag> },
        { title: '로그인', dataIndex: 'provider', key: 'provider', width: 90, render: v => <Tag>{v}</Tag> },
        { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: (v, r) => {
            const cfg = MEMBER_STATUS_CONFIG[v] || MEMBER_STATUS_CONFIG.ACTIVE;
            return <Tooltip title={getSuspendTooltip(r)}><Tag color={cfg.color}>{cfg.label}</Tag></Tooltip>;
        }},
        { title: '처리', key: 'actions', width: 200, render: (_, r) => (
            // 회원은 휴지통 미사용 — 정지/영구정지/해제만 존재
            // 회원 탈퇴는 본인만 가능 (MemberApiController), 관리자가 회원을 삭제하는 인터페이스는 제공하지 않음
            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center', whiteSpace: 'nowrap' }}>
                {r.role !== 'ADMIN' && (<>
                    {(!r.status || r.status === 'ACTIVE') && (<>
                        <Button variant="ghost-sm" onClick={() => { setSanctionTarget(r); setSuspendOpen(true); }} style={{ color: '#fa8c16', borderColor: '#fa8c16' }}>정지</Button>
                        <Button variant="ghost-sm-danger" onClick={() => { setSanctionTarget(r); setBanOpen(true); }}>영구정지</Button>
                    </>)}
                    {(r.status === 'SUSPENDED' || r.status === 'BANNED') && (
                        <Button variant="ghost-sm-success" onClick={async () => {
                            try { await api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_UNBAN(r.id)); message.success('정지가 해제되었습니다.'); setMemberLoaded(false); await loadMembers(true); }
                            catch { message.error('해제에 실패했습니다.'); }
                        }}>정지해제</Button>
                    )}
                </>)}
            </div>
        )},
    ];

    const STORE_STATUS_CONFIG = {
        ACTIVE:    { color: 'green',  label: '정상' },
        SUSPENDED: { color: 'orange', label: '영업정지' },
        BANNED:    { color: 'red',    label: '영구폐업' },
    };

    const storeAdminColumns = [
        { title: 'ID', dataIndex: 'id', key: 'id', width: 60, render: v => <Text style={{ fontSize: fontSize.sm, color: colors.text.tertiary }}>{v}</Text> },
        { title: '가게명', dataIndex: 'name', key: 'name', render: v => <Text style={{ fontSize: fontSize.sm }}>{v}</Text> },
        { title: '카테고리', dataIndex: 'category', key: 'category', width: 100, render: v => <Tag>{v || '-'}</Tag> },
        { title: '주소', dataIndex: 'address', key: 'address', ellipsis: true, render: v => <Text style={{ fontSize: fontSize.sm }}>{v || '-'}</Text> },
        { title: '평점', dataIndex: 'rating', key: 'rating', width: 70, render: v => <Text style={{ fontSize: fontSize.sm }}>{v?.toFixed(1) || '0.0'}</Text> },
        { title: '상태', dataIndex: 'status', key: 'status', width: 90, render: (v, r) => {
            const cfg = STORE_STATUS_CONFIG[v] || STORE_STATUS_CONFIG.ACTIVE;
            const tooltip = r.suspendReason ? `사유: ${r.suspendReason}${r.suspendedUntil ? ` (~${r.suspendedUntil})` : ''}` : '';
            return <Tooltip title={tooltip}><Tag color={cfg.color}>{cfg.label}</Tag></Tooltip>;
        }},
        { title: '처리', key: 'actions', width: 230, render: (_, r) => (
            // 가게도 휴지통 미사용 — 영업정지/영구폐업/해제만 존재
            // 가게 삭제는 사업자 본인만 가능 (StoreApiController)
            <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', alignItems: 'center', whiteSpace: 'nowrap' }}>
                {(!r.status || r.status === 'ACTIVE') && (<>
                    <Button variant="ghost-sm" onClick={() => { setStoreSanctionTarget(r); setStoreSuspendOpen(true); }} style={{ color: '#fa8c16', borderColor: '#fa8c16' }}>영업정지</Button>
                    <Button variant="ghost-sm-danger" onClick={() => { setStoreSanctionTarget(r); setStoreBanOpen(true); }}>영구폐업</Button>
                </>)}
                {(r.status === 'SUSPENDED' || r.status === 'BANNED') && (
                    <Button variant="ghost-sm-success" onClick={() => handleStoreUnban(r.id)}>정지해제</Button>
                )}
            </div>
        )},
    ];

    const tableProps = { columns, rowKey: 'id', size: 'middle', scroll: { x: 'max-content' }, tableLayout: 'auto', pagination: { pageSize: 15, showSizeChanger: false } };

    const RES_STATUS_OPTIONS = [
        { value: 'ALL', label: '전체 상태' }, { value: 'PENDING', label: '대기 중' },
        { value: 'CONFIRMED', label: '승인됨' }, { value: 'CANCELLED', label: '취소됨' },
        { value: 'COMPLETED', label: '이용완료' }, { value: 'REJECTED', label: '거절됨' }, { value: 'NO_SHOW', label: '노쇼' },
    ];

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
        {
            key: 'members',
            label: tabLabel(<TeamOutlined />, '회원 관리'),
            children: (<>
                <FilterToolbar count={filteredMembers.length} search={{ value: memberSearch, onChange: e => setMemberSearch(e.target.value), placeholder: '이름, 이메일로 검색' }} onReload={() => { setMemberLoaded(false); loadMembers(true); }} loading={memberLoading} />
                {!memberFirstLoadRef.current && memberLoading ? <AdminTableSkeleton rows={8} /> : <Table columns={memberColumns} dataSource={filteredMembers} rowKey="id" size="middle" scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: '회원이 없습니다.' }} />}
            </>),
        },
        {
            key: 'stores-admin',
            label: tabLabel(<ShopOutlined />, '가게 관리'),
            children: (<>
                <FilterToolbar count={filteredStores.length} search={{ value: storeSearch, onChange: e => setStoreSearch(e.target.value), placeholder: '가게명, 주소로 검색' }} onReload={() => { setStoreLoaded(false); loadStores(true); }} loading={storeLoading} />
                {!storeFirstLoadRef.current && storeLoading ? <AdminTableSkeleton rows={8} /> : <Table columns={storeAdminColumns} dataSource={filteredStores} rowKey="id" size="middle" scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: '가게가 없습니다.' }} />}
            </>),
        },
        {
            key: 'reservations',
            label: tabLabel(<CalendarOutlined />, '전체 예약'),
            children: (<>
                <FilterToolbar selects={[{ value: resStatusFilter, onChange: setResStatusFilter, options: RES_STATUS_OPTIONS }]} count={filteredReservations.length} search={{ value: resSearch, onChange: e => setResSearch(e.target.value), placeholder: '가게명, 예약자로 검색', disabled: resLoading }} onReload={() => loadReservations(true)} loading={resLoading} />
                {!resFirstLoadRef.current && resLoading ? <AdminTableSkeleton rows={8} cols={[130, 100, 110, 80, 60, 90, 90]} /> : <Table columns={reservationColumns} dataSource={filteredReservations} rowKey="id" size="middle" scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: '예약 내역이 없습니다.' }} />}
            </>),
        },
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

            <SuspendModal key={suspendOpen ? 'suspend-open' : 'suspend-closed'} open={suspendOpen} target={sanctionTarget}
                onCancel={() => setSuspendOpen(false)}
                onOk={handleSuspend} loading={sanctionLoading} />

            <BanModal key={banOpen ? 'ban-open' : 'ban-closed'} open={banOpen} target={sanctionTarget}
                onCancel={() => setBanOpen(false)}
                onOk={handleBan} loading={sanctionLoading} />
            <StoreSuspendModal key={storeSuspendOpen ? 'store-suspend-open' : 'store-suspend-closed'} open={storeSuspendOpen} target={storeSanctionTarget}
                onCancel={() => setStoreSuspendOpen(false)}
                onOk={handleStoreSuspend} loading={storeSanctionLoading} />

            <StoreBanModal key={storeBanOpen ? 'store-ban-open' : 'store-ban-closed'} open={storeBanOpen} target={storeSanctionTarget}
                onCancel={() => setStoreBanOpen(false)}
                onOk={handleStoreBan} loading={storeSanctionLoading} />
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

const SuspendModal = memo(({ open, target, onCancel, onOk, loading }) => {
    const [days, setDays] = useState(7);
    const [reason, setReason] = useState('');
    return (
        <Modal title={`기간 정지 — ${target?.name || target?.email || ''}`}
            open={open} onCancel={onCancel}
            onOk={() => onOk(days, reason)} okText="정지 적용" cancelText="취소"
            okButtonProps={{ loading }} centered>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                <div>
                    <Text style={{ display: 'block', marginBottom: 6 }}>정지 기간 (일)</Text>
                    <InputNumber min={1} max={365} value={days} onChange={v => setDays(v || 7)} style={{ width: '100%' }} />
                </div>
                <div>
                    <Text style={{ display: 'block', marginBottom: 6 }}>정지 사유 (선택)</Text>
                    <TextArea rows={3} placeholder="예: 서비스 이용약관 위반" value={reason}
                        onChange={e => setReason(e.target.value)} maxLength={200} showCount />
                </div>
            </div>
        </Modal>
    );
});

const BanModal = memo(({ open, target, onCancel, onOk, loading }) => {
    const [reason, setReason] = useState('');
    return (
        <Modal title={`영구 정지 — ${target?.name || target?.email || ''}`}
            open={open} onCancel={onCancel}
            onOk={() => onOk(reason)} okText="영구 정지" cancelText="취소"
            okButtonProps={{ danger: true, loading }} centered>
            <div style={{ paddingTop: 8 }}>
                <Text type="danger" style={{ display: 'block', marginBottom: 10 }}>
                    이 작업은 되돌리기 어렵습니다. 정지 해제 버튼으로 해제할 수 있습니다.
                </Text>
                <Text style={{ display: 'block', marginBottom: 6 }}>정지 사유 (선택)</Text>
                <TextArea rows={3} placeholder="예: 반복적인 허위 예약" value={reason}
                    onChange={e => setReason(e.target.value)} maxLength={200} showCount />
            </div>
        </Modal>
    );
});

const StoreSuspendModal = memo(({ open, target, onCancel, onOk, loading }) => {
    const [days, setDays] = useState(7);
    const [reason, setReason] = useState('');
    return (
        <Modal title={`영업정지 — ${target?.name || ''}`}
            open={open} onCancel={onCancel}
            onOk={() => onOk(days, reason)} okText="영업정지 적용" cancelText="취소"
            okButtonProps={{ loading, style: { backgroundColor: '#fa8c16', borderColor: '#fa8c16' } }} centered>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                <div>
                    <Text style={{ display: 'block', marginBottom: 6 }}>영업정지 기간 (일)</Text>
                    <InputNumber min={1} max={365} value={days} onChange={v => setDays(v || 7)} style={{ width: '100%' }} />
                </div>
                <div>
                    <Text style={{ display: 'block', marginBottom: 6 }}>정지 사유 (선택)</Text>
                    <TextArea rows={3} placeholder="예: 위생 법규 위반 등" value={reason}
                        onChange={e => setReason(e.target.value)} maxLength={200} showCount />
                </div>
            </div>
        </Modal>
    );
});

const StoreBanModal = memo(({ open, target, onCancel, onOk, loading }) => {
    const [reason, setReason] = useState('');
    return (
        <Modal title={`영구 폐업 — ${target?.name || ''}`}
            open={open} onCancel={onCancel}
            onOk={() => onOk(reason)} okText="영구 폐업" cancelText="취소"
            okButtonProps={{ danger: true, loading }} centered>
            <div style={{ paddingTop: 8 }}>
                <Text type="danger" style={{ display: 'block', marginBottom: 10 }}>
                    가게를 영구 폐업 처리합니다. 정지 해제 버튼으로 언제든지 원상복구 가능합니다.
                </Text>
                <Text style={{ display: 'block', marginBottom: 6 }}>폐업 사유 (선택)</Text>
                <TextArea rows={3} placeholder="예: 반복적인 서비스 이용규정 위반" value={reason}
                    onChange={e => setReason(e.target.value)} maxLength={200} showCount />
            </div>
        </Modal>
    );
});

const RejectModal = memo(({ open, target, onCancel, onOk, loading }) => {
    const [reason, setReason] = useState('');
    return (
        <Modal title="거절 사유 입력" open={open} onCancel={onCancel}
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
});

export default AdminPanel;
