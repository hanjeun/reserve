import { useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminTableSkeleton, Button, DataState, FormField, FormModal, FormTextArea, PagedDataTable, SegmentedControl } from '../common';
import { FlagOutlined, ShopOutlined, StopOutlined, UndoOutlined, UserOutlined } from '../common/icons';
import DetailInfoRows from '../common/DetailInfoRows';
import { DEFAULT_PAGE_SIZE } from '../../constants/pagination';
import { reservationKeys, reviewKeys } from '../../hooks/queryKeys';
import useMessage from '../../hooks/useMessage';
import { currentSession, assertCurrentSession } from '../../api/sessionScope';
import reservationService from '../../services/reservationService';
import reviewService from '../../services/reviewService';
import { handleApiError } from '../../utils/errorHandler';
import BookingRestrictionDialog from './BookingRestrictionDialog';
import ServiceReportForm from '../report/ServiceReportForm';

const SECTIONS = [{ value: 'reservations', label: '예약 내역' }, { value: 'reviews', label: '리뷰' }, { value: 'restrictions', label: '제한 이력' }];
const STATUSES = { PENDING: '승인 대기', CONFIRMED: '예약 확정', REJECTED: '거절됨', CANCELLED: '취소됨', NO_SHOW: '노쇼', COMPLETED: '이용 완료' };
const ACTORS = { CUSTOMER: '고객', STORE: '가게', SYSTEM: '자동 취소' };
const kst = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Seoul' });
const dateTime = value => value ? kst.format(new Date(value)) : '—';

export default function CustomerHistoryDialog({ customer, open, onClose, afterClose }) {
    const [section, setSection] = useState('reservations');
    const [page, setPage] = useState(1);
    const [report, setReport] = useState(null);
    const [reportOpen, setReportOpen] = useState(false);
    const [restriction, setRestriction] = useState(null);
    const [restrictionOpen, setRestrictionOpen] = useState(false);
    const [reply, setReply] = useState(null);
    const [replyOpen, setReplyOpen] = useState(false);
    const client = useQueryClient();
    const { message } = useMessage();
    const key = reservationKeys.customers(customer?.ownerId, customer?.session);
    const targetKey = [...key, 'detail', customer?.storeId, customer?.memberId];
    const history = useQuery({ queryKey: [...targetKey, section, page], enabled: open && Boolean(customer),
        queryFn: ({ signal }) => reservationService.getBusinessCustomerHistory(customer.storeId, customer.memberId, section,
            { page: page - 1, size: DEFAULT_PAGE_SIZE }, signal),
        placeholderData: (data, previous) => [...targetKey, section].every((part, index) => part === previous?.queryKey[index]) ? data : undefined });
    const changeSection = value => { setSection(value); setPage(1); };
    const closeReport = () => setReportOpen(false);
    const showReport = (type, id) => { setReport({ type, id }); setReportOpen(true); };
    const closeReply = () => setReplyOpen(false);
    const reportButton = (type, id) => <Button variant="ghost-sm" disabled={history.isFetching || Boolean(history.error)} onClick={() => showReport(type, id)}>
        <FlagOutlined aria-hidden="true" /> 신고</Button>;
    const action = useMutation({ mutationFn: async ({ request, epoch }) => {
        assertCurrentSession(epoch);
        const result = await request();
        assertCurrentSession(epoch);
        return result;
    } });
    const run = async (request, close, success) => {
        const epoch = currentSession().epoch;
        try {
            await action.mutateAsync({ request, epoch });
            assertCurrentSession(epoch);
            void client.invalidateQueries({ queryKey: key });
            close();
            message.success(success);
        } catch (error) {
            if (currentSession().epoch === epoch) handleApiError(error, message);
        }
    };
    const submitRestriction = () => {
        const id = restriction.member.restrictionId;
        const { storeId, memberId } = customer;
        void run(() => id != null ? reservationService.releaseNoShowMember(storeId, id)
            : reservationService.restrictNoShowMember(storeId, memberId, {
                ...(restriction.period === 'permanent' ? { permanent: true } : { days: restriction.period }), reason: restriction.reason.trim(),
            }), () => {
            setRestrictionOpen(false);
            void client.invalidateQueries({ queryKey: [...reservationKeys.manage(), 'no-show-members', customer.ownerId] });
        }, id == null ? '이 가게의 새 예약을 제한했어요.' : '수동 예약 제한을 해제했어요.');
    };
    const submitReply = () => void run(() => reviewService.replyAsOwner(reply.id, reply.content.trim()), () => {
        closeReply();
        void client.invalidateQueries({ queryKey: reviewKeys.all() });
    }, '리뷰 답변을 저장했어요.');
    const current = section === 'restrictions' && !history.error ? history.data?.current : null;
    const result = section === 'restrictions' ? history.data?.history : history.data;
    const columnsBySection = {
        reservations: [
            { title: '예약번호', dataIndex: 'code', width: 156, render: value => value || '—' },
            { title: '방문일', key: 'visitTime', width: 158, render: (_, row) => `${row.visitDate} ${row.visitTime?.slice(0, 5) ?? ''}`.trim() },
            { title: '상태', dataIndex: 'status', width: 106, render: value => STATUSES[value] ?? value },
            { title: '취소 주체', key: 'actor', width: 105, render: (_, row) => row.status === 'CANCELLED' ? ACTORS[row.cancellationActor] ?? '미확인' : '—' },
            { title: '관리', key: 'actions', width: 90, render: (_, row) => reportButton('RESERVATION', row.id) },
        ],
        reviews: [
            { title: '별점', dataIndex: 'rating', width: 70, render: value => `${value}점` },
            { title: '리뷰', key: 'content', width: 270, render: (_, row) => <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                <strong>{row.title}</strong><p>{row.content}</p>{row.ownerReply && <p>사업자 답변 · {row.ownerReply}</p>}</div> },
            { title: '작성일', dataIndex: 'createdAt', width: 102, render: value => value?.slice(0, 10) || '—' },
            { title: '관리', key: 'actions', width: 160, render: (_, row) => <>
                <Button variant="ghost-sm" disabled={history.isFetching || Boolean(history.error)}
                    onClick={() => { setReply({ id: row.id, content: row.ownerReply ?? '' }); setReplyOpen(true); }}>
                    {row.ownerReply ? '답변 수정' : '답변하기'}
                </Button>
                {reportButton('REVIEW', row.id)}
            </> },
        ],
        restrictions: [
            { title: '조치', dataIndex: 'action', width: 160, render: value => value === 'BOOKING_RELEASED' ? '수동 제한 해제' : '새 예약 제한' },
            { title: '처리일', dataIndex: 'createdAt', width: 158, render: value => value?.replace('T', ' ').slice(0, 16) || '—' },
            { title: '제한 종료', dataIndex: 'endsAt', width: 180, render: value => value?.replace('T', ' ').slice(0, 16) || '—' },
        ],
    };
    const closed = () => {
        changeSection('reservations');
        setReportOpen(false);
        setRestrictionOpen(false);
        setReplyOpen(false);
        afterClose?.();
    };
    return <>
        <FormModal title="고객 내역" open={open} onClose={onClose} afterClose={closed}
            footer={null} mobileSize="content" width={780} scrollResetKey={section}>
            {customer && <DetailInfoRows rows={[
                { Icon: UserOutlined, label: '고객', value: customer.name },
                { Icon: ShopOutlined, label: '가게', value: customer.storeName },
            ]} />}
            <SegmentedControl block={false} value={section} options={SECTIONS} onChange={changeSection} aria-label="고객 내역 종류" />
            {current && <>
                <p>수동 제한 {current.permanent ? '영구 제한' : current.manualUntil ? `${dateTime(current.manualUntil)}까지` : '없음'}</p>
                {current.automaticUntil && <p>반복 노쇼 자동 제한 {dateTime(current.automaticUntil)}까지</p>}
                {(current.restrictionId != null || current.restrictable) && <div>
                    <Button variant={current.restrictionId != null ? 'ghost-sm' : 'ghost-sm-danger'} disabled={history.isFetching} onClick={() => {
                        setRestriction({ member: { ...customer, restrictionId: current.restrictionId }, storeName: customer.storeName, period: 7, reason: '' });
                        setRestrictionOpen(true);
                    }}>{current.restrictionId != null ? <><UndoOutlined aria-hidden="true" /> 제한 해제</> : <><StopOutlined aria-hidden="true" /> 예약 제한</>}</Button>
                </div>}
            </>}
            {history.error ? <DataState state="error" error={history.error} title="고객 내역을 불러오지 못했어요." onRetry={history.refetch} />
                : <PagedDataTable columns={columnsBySection[section]} dataSource={result?.content ?? []} rowKey="id"
                    placeholder={history.isPending || history.isPlaceholderData ? <AdminTableSkeleton /> : null}
                    locale={{ emptyText: '표시할 내역이 없어요.' }}
                    pagination={{ current: page, total: result?.page?.totalElements ?? result?.totalElements ?? 0,
                        pageSize: DEFAULT_PAGE_SIZE, hideOnSinglePage: true, onChange: setPage }} />}
        </FormModal>
        <ServiceReportForm target={report} open={open && reportOpen && Boolean(report)} onClose={closeReport} afterClose={() => setReport(null)} />
        <BookingRestrictionDialog dialog={restriction} open={open && restrictionOpen && Boolean(restriction)} onClose={() => setRestrictionOpen(false)}
            afterClose={() => setRestriction(null)} onChange={patch => setRestriction(previous => ({ ...previous, ...patch }))}
            onSubmit={submitRestriction} submitting={action.isPending} />
        <FormModal title="리뷰 답변" open={open && replyOpen && Boolean(reply)} onClose={closeReply} afterClose={() => setReply(null)}
            onSubmit={submitReply} submitting={action.isPending} submitText="저장하기" submitDisabled={!reply?.content.trim()}>
            <FormField label="답변"><FormTextArea aria-label="답변" value={reply?.content ?? ''} rows={4} maxLength={500} showCount
                onChange={event => setReply(previous => ({ ...previous, content: event.target.value }))} /></FormField>
        </FormModal>
    </>;
}

CustomerHistoryDialog.propTypes = { customer: PropTypes.object, open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, afterClose: PropTypes.func };
