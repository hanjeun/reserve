import { useContext, useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { Checkbox, Form} from 'antd';
import Pagination from '../common/Pagination';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DataState, FormModal, FormSelect, FormTextArea } from '../common';
import { ModalActionGroup } from '../common/ModalActions';
import { FeedReportListSkeleton } from '../feed/FeedSkeleton';
import FeedMediaStrip from '../feed/FeedMediaStrip';
import { interactionKeys, invalidateInteractions } from '../../hooks/feedInteractionQueries';
import service from '../../services/feedInteractionService';
import useMessage from '../../hooks/useMessage';
import { FEED_REPORT_REASONS, feedDate, feedMediaUrl, feedTotal } from '../../utils/feed';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import useWorkspaceAction from '../../hooks/useWorkspaceAction';
import useReportReviewDraft from './useReportReviewDraft';

const statuses = [{ value: 'OPEN', label: '접수' }, { value: 'RESOLVED', label: '처리 완료' }];
const reasonLabel = value => FEED_REPORT_REASONS.find(item => item.value === value)?.label || value;

export default function CommentReportsPanel({ status, page, onPageChange, enabled = true }) {
    const active = useContext(WorkspaceActivityContext);
    const requestAction = useWorkspaceAction();
    const [selected, setSelected] = useState(null);
    const [form] = Form.useForm();
    const submitLock = useRef(false);
    const [validating, setValidating] = useState(false);
    const client = useQueryClient();
    const { message } = useMessage();
    const params = { page: page - 1, size: 20, status: status === 'ALL' ? undefined : status };
    const list = useQuery({ queryKey: interactionKeys.reports(params), queryFn: ({ signal }) => service.reports(params, signal), enabled: active && enabled, placeholderData: keepPreviousData });
    const total = feedTotal(list.data);
    const lastPage = Math.max(1, Math.ceil(total / 20));
    useEffect(() => {
        if (list.isSuccess && !list.isFetching && !list.isPlaceholderData && page > lastPage) onPageChange(lastPage);
    }, [list.isSuccess, list.isFetching, list.isPlaceholderData, page, lastPage, onPageChange]);
    const report = useQuery({ queryKey: interactionKeys.report(selected), queryFn: ({ signal }) => service.report(selected, signal), enabled: active && enabled && Boolean(selected), staleTime: 0 });
    const currentId = report.data?.commentId;
    const current = useQuery({ queryKey: interactionKeys.current(currentId), queryFn: ({ signal }) => service.currentComment(currentId, signal), enabled: active && enabled && Boolean(selected && currentId), staleTime: 0, retry: false });
    const draft = useReportReviewDraft({ selected, report, form, target: current });
    const formReady = draft.ready;
    const review = useMutation({ mutationFn: async ({ reportId, values, session }) => {
        assertCurrentSession(session); const saved = await service.reviewReport(reportId, values); assertCurrentSession(session); return saved;
    },
        onSuccess: async (_, variables) => { if (!isCurrentSession(variables.session)) return; await invalidateInteractions(client); if (isCurrentSession(variables.session)) { message.success('댓글 신고를 처리했어요.'); setSelected(null); } },
        onError: failure => { if (!failure.isStaleSession) { if (failure.status === 409) draft.reject(); message.error(failure.message); } } });
    const visibility = useMutation({ mutationFn: async ({ commentId, values, session }) => {
        assertCurrentSession(session); const saved = await service.visibility(commentId, values); assertCurrentSession(session); return saved;
    },
        onSuccess: async (saved, variables) => { if (!isCurrentSession(variables.session)) return; draft.acceptTarget(variables.reportId, saved.revision); await invalidateInteractions(client); if (isCurrentSession(variables.session)) { form.setFieldValue('visibilityReason', ''); message.success('댓글 공개 상태를 변경했어요.'); } },
        onError: failure => { if (!failure.isStaleSession) { message.error(failure.message); if (failure.status === 409) draft.rejectTarget(); } } });
    const busy = validating || review.isPending || visibility.isPending || draft.refreshing;
    const moderate = async hidden => {
        if (submitLock.current || busy || !formReady || draft.conflict || draft.targetConflict || !Number.isSafeInteger(draft.targetRevision) || current.isFetching || current.isError || !current.data) return;
        const session = currentSession().epoch;
        const commentId = currentId;
        const revision = draft.targetRevision;
        submitLock.current = true; setValidating(true);
        try { const values = await form.validateFields(['visibilityReason']); assertCurrentSession(session); await visibility.mutateAsync({ reportId: selected, commentId, values: { hidden, reason: values.visibilityReason.trim(), revision }, session }); }
        catch { /* 오류는 이유 입력란에 남긴다. */ }
        finally { submitLock.current = false; setValidating(false); }
    };
    const saveReview = async () => {
        if (submitLock.current || busy || !selected || report.isFetching || report.isError || !formReady || draft.conflict) return;
        const session = currentSession().epoch;
        const reportId = selected;
        const revision = draft.revision;
        submitLock.current = true; setValidating(true);
        try { const values = await form.validateFields(['status', 'hold', 'note']); assertCurrentSession(session); await review.mutateAsync({ reportId, values: { ...values, revision }, session }); }
        catch { /* 입력 오류는 처리 이유에 남긴다. */ }
        finally { submitLock.current = false; setValidating(false); }
    };
    const close = () => { if (!busy) setSelected(null); };
    return <section aria-label="댓글 신고 관리">
        {!enabled ? <DataState state="empty" title="댓글 신고함을 준비하고 있어요." />
            : list.isPending ? <FeedReportListSkeleton label="댓글 신고를 불러오는 중" /> : list.isError ? <DataState state="error" title="댓글 신고를 불러오지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />
            : !list.data?.content?.length ? <DataState state="empty" title="접수된 댓글 신고가 없어요." />
                : <ul className="reserve-feed-report-list">{list.data.content.map(item => <li key={item.id}>
                    <div><strong>{reasonLabel(item.reason)}</strong><p>{item.status === 'OPEN' ? '접수' : '처리 완료'} · {feedDate(item.createdAt)}{item.hold ? ' · 파기 보류' : ''}</p></div>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => setSelected(item.id)}>검토</Button>
                </li>)}</ul>}
        {list.isSuccess && total > 20 && <Pagination current={page} total={total} pageSize={20} showSizeChanger={false} onChange={onPageChange} disabled={list.isFetching} />}
        <FormModal title="댓글 신고 검토" open={Boolean(selected)} onClose={close} width={680} rootClassName="reserve-feed-modal"
            submitting={busy} navigationDirty={draft.dirty}
            footer={<ModalActionGroup><Button variant="outline" size="sm" onClick={() => requestAction(close)} disabled={busy}>닫기</Button>
                <Button size="sm" loading={review.isPending} disabled={busy || report.isFetching || report.isError || !formReady || draft.conflict} onClick={saveReview}>처리 저장</Button></ModalActionGroup>}>
            {draft.invalidVersion ? <DataState state="error" title="검토 정보를 불러오지 못했어요." onRetry={draft.reload} retrying={draft.refreshing} /> : report.isPending || !report.isError && !formReady ? <FeedReportListSkeleton /> : report.isError ? <DataState state="error" compact title="댓글 신고 원문을 불러오지 못했어요." error={report.error} onRetry={report.refetch} retrying={report.isFetching} /> : report.data && <>
                <p><strong>{reasonLabel(report.data.reason)}</strong> · {feedDate(report.data.createdAt)}</p>
                <p className="reserve-feed-post-text">{report.data.detail}</p>
                <p className="reserve-feed-note">신고 시점의 댓글이에요. 이후 수정·삭제와 별도로 보관해요.</p>
                <article className="reserve-feed-comment"><strong>{report.data.comment.author?.nickname || '공개 프로필'}</strong><p className="reserve-feed-post-text">{report.data.comment.content}</p></article>
                <FeedMediaStrip label="신고 당시 댓글" images={(report.data.comment.images || []).map(image => ({ ...image, src: feedMediaUrl(image.url) })).filter(image => image.src)} />
                {current.data?.state !== 'DELETED' && current.data && <>
                    <p className="reserve-feed-note">현재 댓글 · {current.data.state === 'HIDDEN' ? '관리자 숨김' : '공개 중'}</p>
                    <p className="reserve-feed-post-text">{current.data.content}</p>
                    <FeedMediaStrip label="현재 댓글" images={(current.data.images || []).map(image => ({ ...image, src: feedMediaUrl(image.url) })).filter(image => image.src)} />
                </>}
                {draft.conflict && <DataState state="error" compact title="다른 관리자가 신고를 변경했어요. 다시 불러와 검토해주세요."
                    onRetry={() => requestAction(draft.reload, { discard: false })} retrying={draft.refreshing} />}
                {draft.targetConflict && !draft.conflict && <DataState state="error" compact title="댓글의 내용이나 공개 상태가 바뀌었어요. 다시 불러와 검토해주세요."
                    onRetry={() => requestAction(draft.reload, { discard: false })} retrying={draft.refreshing} />}
                <Form form={form} layout="vertical" disabled={busy}>
                    <Form.Item name="status" label="처리 상태" rules={[{ required: true, message: '처리 상태를 선택해주세요.' }]}><FormSelect options={statuses} aria-label="댓글 신고 처리 상태" /></Form.Item>
                    <Form.Item name="hold" valuePropName="checked"><Checkbox>분쟁 등으로 자료 파기를 보류해요.</Checkbox></Form.Item>
                    <Form.Item name="note" label="신고 처리 이유" rules={[{ required: true, whitespace: true, message: '처리 이유를 입력해주세요.' }, { max: 1000, message: '1,000자 이하로 입력해주세요.' }]}>
                        <FormTextArea rows={3} maxLength={1000} aria-label="댓글 신고 처리 이유" /></Form.Item>
                    <Form.Item name="visibilityReason" label="댓글 숨김·복원 이유" rules={[{ required: true, whitespace: true, message: '공개 상태 변경 이유를 입력해주세요.' }, { max: 500, message: '500자 이하로 입력해주세요.' }]}>
                        <FormTextArea rows={2} maxLength={500} aria-label="댓글 숨김·복원 이유" /></Form.Item>
                </Form>
                {current.isError && <p className="reserve-feed-note">현재 댓글 원문을 조회할 수 없어요. 신고 증거는 계속 검토할 수 있어요.</p>}
                <div className="reserve-feed-editor-actions"><Button variant="outline" size="sm" onClick={() => moderate(true)} disabled={busy || draft.conflict || draft.targetConflict || !Number.isSafeInteger(draft.targetRevision) || current.isFetching || current.isError || current.data?.state !== 'PUBLISHED'}>댓글 숨김</Button>
                    <Button variant="outline" size="sm" onClick={() => moderate(false)} disabled={busy || draft.conflict || draft.targetConflict || !Number.isSafeInteger(draft.targetRevision) || current.isFetching || current.isError || current.data?.state !== 'HIDDEN'}>댓글 공개 복원</Button></div>
                <p className="reserve-feed-note">처리 완료한 신고는 365일 뒤 파기해요. 보류 중에는 파기하지 않으며 보류를 해제하면 기간을 다시 계산해요. 열람·처리 기록도 보관해요.</p>
            </>}
        </FormModal>
    </section>;
}
CommentReportsPanel.propTypes = { status: PropTypes.string.isRequired, page: PropTypes.number.isRequired, onPageChange: PropTypes.func.isRequired, enabled: PropTypes.bool };
