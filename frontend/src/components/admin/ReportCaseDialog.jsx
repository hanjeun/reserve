import { useState } from 'react';
import PropTypes from 'prop-types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminTableSkeleton, DataState, FormField, FormModal, FormSelect, FormTextArea, PagedDataTable } from '../common';
import { CalendarOutlined, CheckCircleOutlined, CreditCardOutlined, FileTextOutlined } from '../common/icons';
import DetailInfoRows from '../common/DetailInfoRows';
import { DEFAULT_PAGE_SIZE } from '../../constants/pagination';
import { RESERVATION_STATUS_LABELS } from '../../constants/status';
import { assertCurrentSession, currentSession } from '../../api/sessionScope';
import { adminKeys, reservationKeys, reviewKeys, storeKeys } from '../../hooks/queryKeys';
import useMessage from '../../hooks/useMessage';
import serviceReportService from '../../services/serviceReportService';
import { handleApiError } from '../../utils/errorHandler';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { REPORT_DECISION_LABELS, REPORT_REASON_LABELS, REPORT_TYPE_LABELS, reportStateLabel } from '../report/serviceReportLabels';

const ENTRY_TYPES = { REPORT: '신고', APPEAL: '이의 신청', DECISION: '처리' };
const PAYMENT_LABELS = { READY: '결제 대기', PAID: '결제 완료', CANCELLED: '취소됨', FAILED: '결제 실패',
    REFUND_PENDING: '환불 대기', PARTIAL_REFUNDED: '부분 환불', REFUNDED: '환불 완료' };
const columns = [
    { title: '종류', dataIndex: 'kind', width: 96, render: value => ENTRY_TYPES[value] ?? value },
    { title: '사유', dataIndex: 'reason', width: 130, render: value => REPORT_REASON_LABELS[value] ?? REPORT_DECISION_LABELS[value] ?? '—' },
    { title: '내용', key: 'details', width: 272, render: (_, row) => <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
        <p>{row.details}</p>{row.evidence && <p>{row.evidence}</p>}</div> },
    { title: '등록일', dataIndex: 'createdAt', width: 147, render: value => value?.replace('T', ' ').slice(0, 16) || '—' },
];

export default function ReportCaseDialog({ target, open, onClose, afterClose }) {
    const [page, setPage] = useState(1);
    const [result, setResult] = useState();
    const [note, setNote] = useState('');
    const [reviewRevision, setReviewRevision] = useState(null);
    const [conflict, setConflict] = useState(false);
    const client = useQueryClient();
    const { message } = useMessage();
    const detail = useQuery({ queryKey: ['admin', 'report-case', target?.session, target?.id, page], enabled: open && Boolean(target),
        queryFn: ({ signal }) => serviceReportService.adminDetail(target.id, { page: page - 1, size: DEFAULT_PAGE_SIZE }, signal),
        placeholderData: (data, previous) => previous?.queryKey[2] === target?.session && previous?.queryKey[3] === target?.id ? data : undefined });
    const data = detail.data;
    const canDecide = ['OPEN', 'APPEALED'].includes(data?.report?.status);
    const options = ['DISMISS', 'RESOLVE', ...(data?.reviewExists ? [data.reviewHidden ? 'RESTORE_REVIEW' : 'HIDE_REVIEW'] : [])];
    const changedSinceReview = conflict || reviewRevision != null && reviewRevision !== data?.report.revision;
    const rememberRevision = () => setReviewRevision(current => current ?? data?.report.revision ?? null);
    const action = useMutation({ mutationFn: async ({ id, body, epoch }) => {
        assertCurrentSession(epoch);
        const saved = await serviceReportService.decide(id, body);
        assertCurrentSession(epoch);
        return saved;
    } });
    const submit = async () => {
        if (!canDecide || !options.includes(result) || !note.trim() || action.isPending || detail.isFetching || changedSinceReview) return;
        const epoch = currentSession().epoch;
        try {
            await action.mutateAsync({ id: target.id, body: { result, note: note.trim(), revision: reviewRevision }, epoch });
            assertCurrentSession(epoch);
            for (const queryKey of [adminKeys.reportQueue(), ['admin', 'report-case', target.session, target.id],
                reviewKeys.all(), storeKeys.all(), reservationKeys.manage(), ['service-reports', 'mine']]) void client.invalidateQueries({ queryKey });
            message.success('신고 처리 결과를 저장했어요.');
            onClose();
        } catch (error) {
            if (currentSession().epoch !== epoch) return;
            if (httpStatusOf(error) === 409) setConflict(true);
            else handleApiError(error, message);
        }
    };
    const reloadForReview = async () => {
        const latest = await detail.refetch();
        if (latest.isError) return;
        setReviewRevision(latest.data?.report.revision ?? null);
        setConflict(false);
        setResult(undefined);
    };
    const closed = () => {
        setPage(1);
        setResult(undefined);
        setNote('');
        setReviewRevision(null);
        setConflict(false);
        afterClose();
    };
    return <FormModal title={`${REPORT_TYPE_LABELS[target?.type] ?? ''} 신고 검토`} open={open} onClose={onClose} afterClose={closed} width={760}
        footer={canDecide ? undefined : null} onSubmit={submit} submitting={action.isPending} submitText="처리하기"
        navigationDirty={Boolean(result || note)}
        submitDisabled={!options.includes(result) || !note.trim() || detail.isFetching || Boolean(detail.error) || changedSinceReview}>
        {detail.error ? <DataState state="error" error={detail.error} title="신고 상세를 불러오지 못했어요." onRetry={detail.refetch} />
            : data ? <>
                <p>신고 #{data.report.id} · {reportStateLabel(data.report.status)}</p>
                {data.report.decisionNote && <p>처리 결과 · {data.report.decisionNote}</p>}
                {data.reservation && <DetailInfoRows rows={[
                    { Icon: FileTextOutlined, label: '예약번호', value: data.reservation.code ?? '—' },
                    { Icon: CalendarOutlined, label: '예약 상태', value: RESERVATION_STATUS_LABELS[data.reservation.status] ?? '—' },
                    { Icon: CheckCircleOutlined, label: '체크인', value: data.reservation.checkedInAt?.replace('T', ' ').slice(0, 16) ?? '기록 없음' },
                    { Icon: CreditCardOutlined, label: '결제 기록', value: data.reservation.paymentStatuses
                        .map(value => PAYMENT_LABELS[value] ?? value).join(' · ') || '기록 없음' },
                ]} />}
                <PagedDataTable rowKey="id" columns={columns} dataSource={data.history.content} locale={{ emptyText: '등록된 내역이 없어요.' }}
                    placeholder={detail.isPlaceholderData ? <AdminTableSkeleton /> : null}
                    pagination={{ current: page, total: data.history.page?.totalElements ?? data.history.totalElements ?? 0,
                        pageSize: DEFAULT_PAGE_SIZE, hideOnSinglePage: true, onChange: setPage }} />
                {canDecide && <>
                    {changedSinceReview && <DataState state="error" compact title="신고 내역이 바뀌었어요. 다시 불러와 확인해주세요."
                        onRetry={reloadForReview} retrying={detail.isFetching} />}
                    <FormField label="처리 결과"><FormSelect aria-label="처리 결과" value={result} onChange={value => { rememberRevision(); setResult(value); }}
                        options={options.map(value => ({ value, label: REPORT_DECISION_LABELS[value] }))} /></FormField>
                    <FormField label="처리 근거"><FormTextArea aria-label="처리 근거" rows={3} maxLength={500} showCount value={note}
                        onChange={event => { rememberRevision(); setNote(event.target.value); }} /></FormField>
                </>}
            </> : <AdminTableSkeleton />}
    </FormModal>;
}

ReportCaseDialog.propTypes = { target: PropTypes.object, open: PropTypes.bool.isRequired, onClose: PropTypes.func.isRequired, afterClose: PropTypes.func.isRequired };
