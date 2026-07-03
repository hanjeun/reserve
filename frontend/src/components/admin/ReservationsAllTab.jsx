/**
 * RESERVE - 관리자 전체 예약 탭
 * AdminPanel.jsx에서 분리 (Cognitive Complexity 17 → 15 목표)
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Typography, Table, Tag } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import { Button, FilterToolbar, AdminTableSkeleton } from '../common';
import { useMessage } from '../../hooks';
import useDebounce from '../../hooks/useDebounce';
import api from '../../api/axios';
import { API_ENDPOINTS } from '../../constants';
import { colors, fontSize } from '../../styles/tokens';
import { formatTime, formatCurrency } from '../../utils';

const { Text } = Typography;

const RES_STATUS_CONFIG = {
    PENDING:   { color: 'orange',  label: '대기 중' },
    CONFIRMED: { color: 'blue',    label: '승인됨' },
    CANCELLED: { color: 'default', label: '취소됨' },
    COMPLETED: { color: 'green',   label: '이용완료' },
    REJECTED:  { color: 'red',     label: '거절됨' },
    NO_SHOW:   { color: 'purple',  label: '노쇼' },
};

const RES_STATUS_OPTIONS = [
    { value: 'ALL', label: '전체 상태' }, { value: 'PENDING', label: '대기 중' },
    { value: 'CONFIRMED', label: '승인됨' }, { value: 'CANCELLED', label: '취소됨' },
    { value: 'COMPLETED', label: '이용완료' }, { value: 'REJECTED', label: '거절됨' }, { value: 'NO_SHOW', label: '노쇼' },
];

const ReservationsAllTab = () => {
    const { message, confirm } = useMessage();
    const [allReservations, setAllReservations] = useState([]);
    const [resLoading, setResLoading]   = useState(false);
    const [resLoaded, setResLoaded]     = useState(false);
    const [resSearch, setResSearch]     = useState('');
    const [resStatusFilter, setResStatusFilter] = useState('ALL');
    const debouncedResSearch = useDebounce(resSearch, 300);
    const resFirstLoadRef = useRef(false);

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

    useEffect(() => { loadReservations(); }, [loadReservations]);

    const handleSoftDeleteReservation = (r) => confirm({
        title: '예약 휴지통으로 이동', content: `예약 #${r.id}을 휴지통으로 이동하시겠습니까?`,
        okText: '삭제', cancelText: '취소', okButtonProps: { danger: true }, centered: true,
        onOk: async () => {
            try { await api.delete(API_ENDPOINTS.ADMIN_MANAGE.RESERVATION_DELETE(r.id)); message.success('휴지통으로 이동되었습니다.'); await loadReservations(true); }
            catch { message.error('삭제에 실패했습니다.'); }
        },
    });

    const filteredReservations = React.useMemo(() => {
        let list = resStatusFilter === 'ALL' ? allReservations : allReservations.filter(r => r.status === resStatusFilter);
        if (debouncedResSearch.trim()) {
            const kw = debouncedResSearch.toLowerCase();
            list = list.filter(r => r.storeName?.toLowerCase().includes(kw) || r.memberName?.toLowerCase().includes(kw) || r.memberEmail?.toLowerCase().includes(kw));
        }
        return list;
    }, [allReservations, resStatusFilter, debouncedResSearch]);

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

    return (
        <>
            <FilterToolbar
                selects={[{ value: resStatusFilter, onChange: setResStatusFilter, options: RES_STATUS_OPTIONS }]}
                count={filteredReservations.length}
                search={{ value: resSearch, onChange: e => setResSearch(e.target.value), placeholder: '가게명, 예약자로 검색', disabled: resLoading }}
                onReload={() => loadReservations(true)}
                loading={resLoading}
            />
            {!resFirstLoadRef.current && resLoading
                ? <AdminTableSkeleton rows={8} cols={[130, 100, 110, 80, 60, 90, 90]} />
                : <Table columns={reservationColumns} dataSource={filteredReservations} rowKey="id" size="middle" scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, showSizeChanger: false }} locale={{ emptyText: '예약 내역이 없습니다.' }} />
            }
        </>
    );
};

export default ReservationsAllTab;
