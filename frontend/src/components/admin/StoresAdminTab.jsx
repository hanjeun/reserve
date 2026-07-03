/**
 * RESERVE - 관리자 가게 관리 탭
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

const STORE_STATUS_CONFIG = {
    ACTIVE:    { color: 'green',  label: '정상' },
    SUSPENDED: { color: 'orange', label: '영업정지' },
    BANNED:    { color: 'red',    label: '영구폐업' },
};

const StoreSuspendModal = memo(({ open, target, onCancel, onOk, loading }) => {
    const [days, setDays] = useState(7);
    const [reason, setReason] = useState('');
    return (
        <Modal title={
            <Flex align="center" gap={8}>
                <ExclamationCircleFilled style={{ color: colors.warning.main, fontSize: 18 }} />
                <span>{`영업정지 — ${target?.name || ''}`}</span>
            </Flex>
        }
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
        <Modal title={
            <Flex align="center" gap={8}>
                <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                <span>{`영구 폐업 — ${target?.name || ''}`}</span>
            </Flex>
        }
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

const StoresAdminTab = () => {
    const { message, confirm } = useMessage();
    const [stores, setStores]             = useState([]);
    const [storeLoading, setStoreLoading] = useState(false);
    const [storeLoaded, setStoreLoaded]   = useState(false);
    const [storeSearch, setStoreSearch]   = useState('');
    const debouncedStoreSearch = useDebounce(storeSearch, 300);
    const storeFirstLoadRef = useRef(false);

    const [storeSanctionTarget, setStoreSanctionTarget] = useState(null);
    const [storeSuspendOpen, setStoreSuspendOpen]       = useState(false);
    const [storeBanOpen, setStoreBanOpen]               = useState(false);
    const [storeSanctionLoading, setStoreSanctionLoading] = useState(false);

    const filteredStores = React.useMemo(() => {
        if (!debouncedStoreSearch.trim()) return stores;
        const kw = debouncedStoreSearch.toLowerCase();
        return stores.filter(s => s.name?.toLowerCase().includes(kw) || s.address?.toLowerCase().includes(kw));
    }, [stores, debouncedStoreSearch]);

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

    useEffect(() => { loadStores(); }, [loadStores]);

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

    // 정지 해제 — 되돌리기 애매한 액션이라 즉시 실행 대신 확인 모달 한 번 거침
    const handleStoreUnban = (r) => {
        confirm({
            title: '영업정지 해제',
            content: `'${r.name}' 가게의 정지를 해제하시겠습니까?`,
            okText: '해제', cancelText: '취소', centered: true,
            onOk: async () => {
                try {
                    await api.post(API_ENDPOINTS.ADMIN_MANAGE.STORE_UNBAN(r.id));
                    message.success('영업정지가 해제되었습니다.');
                    setStoreLoaded(false);
                    await loadStores(true);
                } catch { message.error('해제에 실패했습니다.'); }
            },
        });
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
                    <Button variant="ghost-sm-success" onClick={() => handleStoreUnban(r)}>정지해제</Button>
                )}
            </div>
        )},
    ];

    return (
        <>
            <FilterToolbar count={filteredStores.length} search={{ value: storeSearch, onChange: e => setStoreSearch(e.target.value), placeholder: '가게명, 주소로 검색' }} onReload={() => { setStoreLoaded(false); loadStores(true); }} loading={storeLoading} />
            {!storeFirstLoadRef.current && storeLoading ? <AdminTableSkeleton rows={8} /> : (
                <Table columns={storeAdminColumns} dataSource={filteredStores} rowKey="id" size="middle" scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: '가게가 없습니다.' }} />
            )}

            <StoreSuspendModal key={storeSuspendOpen ? 'store-suspend-open' : 'store-suspend-closed'} open={storeSuspendOpen} target={storeSanctionTarget}
                onCancel={() => setStoreSuspendOpen(false)} onOk={handleStoreSuspend} loading={storeSanctionLoading} />
            <StoreBanModal key={storeBanOpen ? 'store-ban-open' : 'store-ban-closed'} open={storeBanOpen} target={storeSanctionTarget}
                onCancel={() => setStoreBanOpen(false)} onOk={handleStoreBan} loading={storeSanctionLoading} />
        </>
    );
};

export default StoresAdminTab;
