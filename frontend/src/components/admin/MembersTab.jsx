/**
 * RESERVE - 관리자 회원 관리 탭
 * AdminPanel.jsx에서 분리 (Cognitive Complexity 17 → 15 목표)
 */
import React, { useState, useCallback, useEffect, useRef, memo } from 'react';
import { Typography, Table, Tag, Tooltip, Modal, Input, InputNumber, Flex } from 'antd';
import { ExclamationCircleFilled } from '@ant-design/icons';
import { Button, FilterToolbar, AdminTableSkeleton } from '../common';
import { useMessage } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;
const { TextArea } = Input;

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

const SuspendModal = memo(({ open, target, onCancel, onOk, loading }) => {
    const [days, setDays] = useState(7);
    const [reason, setReason] = useState('');
    return (
        <Modal title={
            <Flex align="center" gap={8}>
                <ExclamationCircleFilled style={{ color: colors.warning.main, fontSize: 18 }} />
                <span>{`기간 정지 — ${target?.name || target?.email || ''}`}</span>
            </Flex>
        }
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
        <Modal title={
            <Flex align="center" gap={8}>
                <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                <span>{`영구 정지 — ${target?.name || target?.email || ''}`}</span>
            </Flex>
        }
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

const MembersTab = () => {
    const { message, confirm } = useMessage();
    const [members, setMembers]             = useState([]);
    const [memberLoading, setMemberLoading] = useState(false);
    const [memberLoaded, setMemberLoaded]   = useState(false);
    const [memberSearch, setMemberSearch]   = useState('');
    const debouncedMemberSearch = useDebounce(memberSearch, 300);
    const memberFirstLoadRef = useRef(false);

    const [sanctionTarget, setSanctionTarget]   = useState(null);
    const [suspendOpen, setSuspendOpen]         = useState(false);
    const [banOpen, setBanOpen]                 = useState(false);
    const [sanctionLoading, setSanctionLoading] = useState(false);

    const filteredMembers = React.useMemo(() => {
        if (!debouncedMemberSearch.trim()) return members;
        const kw = debouncedMemberSearch.toLowerCase();
        return members.filter(m => m.name?.toLowerCase().includes(kw) || m.email?.toLowerCase().includes(kw));
    }, [members, debouncedMemberSearch]);

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

    useEffect(() => { loadMembers(); }, [loadMembers]);

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

    // 정지 해제 — 되돌리기 애매한 액션이라 즉시 실행 대신 확인 모달 한 번 거침
    const handleUnban = (r) => {
        confirm({
            title: '정지 해제',
            content: `'${r.name || r.email}' 님의 정지를 해제하시겠습니까?`,
            okText: '해제', cancelText: '취소', centered: true,
            onOk: async () => {
                try {
                    await api.post(API_ENDPOINTS.ADMIN_MANAGE.MEMBER_UNBAN(r.id));
                    message.success('정지가 해제되었습니다.');
                    setMemberLoaded(false);
                    await loadMembers(true);
                } catch { message.error('해제에 실패했습니다.'); }
            },
        });
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
                        <Button variant="ghost-sm-success" onClick={() => handleUnban(r)}>정지해제</Button>
                    )}
                </>)}
            </div>
        )},
    ];

    return (
        <>
            <FilterToolbar count={filteredMembers.length} search={{ value: memberSearch, onChange: e => setMemberSearch(e.target.value), placeholder: '이름, 이메일로 검색' }} onReload={() => { setMemberLoaded(false); loadMembers(true); }} loading={memberLoading} />
            {!memberFirstLoadRef.current && memberLoading ? <AdminTableSkeleton rows={8} /> : (
                <Table columns={memberColumns} dataSource={filteredMembers} rowKey="id" size="middle" scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: '회원이 없습니다.' }} />
            )}

            <SuspendModal key={suspendOpen ? 'suspend-open' : 'suspend-closed'} open={suspendOpen} target={sanctionTarget}
                onCancel={() => setSuspendOpen(false)} onOk={handleSuspend} loading={sanctionLoading} />
            <BanModal key={banOpen ? 'ban-open' : 'ban-closed'} open={banOpen} target={sanctionTarget}
                onCancel={() => setBanOpen(false)} onOk={handleBan} loading={sanctionLoading} />
        </>
    );
};

export default MembersTab;
