import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Checkbox, Form, Tag } from 'antd';
import { useSearchParams } from 'react-router-dom';
import Pagination from '../common/Pagination';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, DataState, FilterMenu, FormModal, FormSelect, FormTextArea, SegmentedControl } from '../common';
import FeedPostCard from '../feed/FeedPostCard';
import CommentReportsPanel from './CommentReportsPanel';
import { useFeedInteractions } from '../../hooks/feedInteractionQueries';
import FeedSkeleton, { FeedReportListSkeleton, FeedReportsSkeleton } from '../feed/FeedSkeleton';
import useMessage from '../../hooks/useMessage';
import { feedKeys, invalidateFeed, useFeedConfig } from '../../hooks/feedQueries';
import { invalidateStoreNews, useStoreNewsConfig } from '../../hooks/storeNewsQueries';
import feedService from '../../services/feedService';
import { FEED_REPORT_REASONS, feedDate, feedTotal } from '../../utils/feed';
import ManagementListToolbar from '../common/ManagementListToolbar';
import { WorkspaceActivityContext } from '../layout/workspaceActivity';
import { useQueryParamsState } from '../../hooks/useQueryParamState';
import useWorkspaceAction from '../../hooks/useWorkspaceAction';
import useTabQueryMemory from '../../hooks/useTabQueryMemory';
import { assertCurrentSession, currentSession, isCurrentSession } from '../../api/sessionScope';
import { REPORT_QUERY_DEFAULTS, REPORT_URL_KEYS, REPORT_STATUS_OPTIONS, REPORT_AUDIT_ACTION_OPTIONS,
    FEED_AUDIT_ACTION_LABELS, reportTabSearch, reportMode, reviewOption, reviewPage } from './managementReviewQuery';
import useReportReviewDraft from './useReportReviewDraft';

const PAGE_SIZE = 20;
const statuses = [{ value: 'OPEN', label: '접수' }, { value: 'RESOLVED', label: '처리 완료' }];

export default function FeedReportsPanel() {
    const [urlParams] = useSearchParams();
    const [query, setQuery] = useQueryParamsState(REPORT_QUERY_DEFAULTS, REPORT_URL_KEYS[reportMode(urlParams.get('reportMode'))]);
    const mode = reportMode(query.reportMode);
    const remembered = useTabQueryMemory('admin/feed-reports', mode, urlParams, REPORT_URL_KEYS);
    const changeMode = useCallback(value => {
        const next = new URLSearchParams(reportTabSearch(urlParams, value, remembered(value)));
        setQuery(Object.fromEntries(Object.keys(REPORT_QUERY_DEFAULTS).map(key => [key, next.get(key)])), { replace: false });
    }, [remembered, setQuery, urlParams]);
    const status = reviewOption(REPORT_STATUS_OPTIONS, mode === 'comments' ? query.commentReportStatus : query.reportStatus, 'ALL');
    const auditAction = reviewOption(REPORT_AUDIT_ACTION_OPTIONS, query.reportAuditAction, 'ALL');
    const pageKey = mode === 'comments' ? 'commentReportPage' : mode === 'audit' ? 'reportAuditPage' : 'reportPage';
    const page = reviewPage(query[pageKey]);
    const setPage = value => setQuery({ [pageKey]: String(value) });
    const active = useContext(WorkspaceActivityContext);
    const requestAction = useWorkspaceAction();
    const [selected, setSelected] = useState(null);
    const [form] = Form.useForm();
    const submitLock = useRef(false);
    const [validating, setValidating] = useState(false);
    const client = useQueryClient();
    const { message } = useMessage();
    const config = useFeedConfig();
    const newsConfig = useStoreNewsConfig(true);
    const interactions = useFeedInteractions();
    const enabled = config.data?.enabled === true || newsConfig.data?.enabled === true;
    const configPending = !enabled && (config.isPending || newsConfig.isPending);
    const params = { page: page - 1, size: PAGE_SIZE, status: status === 'ALL' ? undefined : status };
    const list = useQuery({ queryKey: feedKeys.reports(params), queryFn: ({ signal }) => feedService.reports(params, signal), enabled: active && enabled && mode === 'reports', placeholderData: keepPreviousData });
    const auditParams = { page: page - 1, size: PAGE_SIZE, action: auditAction === 'ALL' ? undefined : auditAction };
    const audit = useQuery({ queryKey: feedKeys.audit(auditParams), queryFn: ({ signal }) => feedService.audit(auditParams, signal), enabled: active && enabled && mode === 'audit', placeholderData: keepPreviousData });
    const activeList = mode === 'audit' ? audit : list;
    const totalPages = Math.max(1, Math.ceil(feedTotal(activeList.data) / PAGE_SIZE));
    useEffect(() => {
        if (mode !== 'comments' && activeList.isSuccess && !activeList.isFetching && !activeList.isPlaceholderData && page > totalPages) setQuery({ [pageKey]: String(totalPages) });
    }, [mode, activeList.isSuccess, activeList.isFetching, activeList.isPlaceholderData, page, totalPages, pageKey, setQuery]);
    useEffect(() => {
        if (mode === 'comments' && interactions.data?.enabled === false) changeMode('reports');
    }, [mode, interactions.data?.enabled, changeMode]);
    const report = useQuery({ queryKey: feedKeys.report(selected), queryFn: ({ signal }) => feedService.reportDetail(selected, signal), enabled: active && enabled && Boolean(selected), staleTime: 0 });
    const draft = useReportReviewDraft({ selected, report, form });
    const formReady = draft.ready;
    const update = useMutation({ mutationFn: async ({ reportId, values, session }) => {
        assertCurrentSession(session); const saved = await feedService.updateReport(reportId, values); assertCurrentSession(session); return saved;
    },
        onSuccess: async (_data, variables) => {
            if (!isCurrentSession(variables.session)) return;
            await invalidateFeed(client);
            if (isCurrentSession(variables.session)) { setSelected(null); message.success('신고 처리를 저장했어요.'); }
        },
        onError: error => { if (!error.isStaleSession) { if (error.status === 409) draft.reject(); message.error(error.message); } },
    });
    const visibility = useMutation({ mutationFn: async ({ newsId, postId, values, session }) => {
        assertCurrentSession(session);
        const saved = await (newsId ? feedService.newsVisibility(newsId, values) : feedService.visibility(postId, values));
        assertCurrentSession(session); return saved;
    },
        onSuccess: async (saved, variables) => {
            if (!isCurrentSession(variables.session)) return;
            draft.acceptTarget(variables.reportId, saved.revision);
            await Promise.all([invalidateFeed(client), ...(variables.newsId ? [invalidateStoreNews(client)] : [])]);
            if (isCurrentSession(variables.session)) { form.setFieldValue('visibilityReason', ''); message.success('공개 상태를 변경했어요.'); }
        },
        onError: error => { if (!error.isStaleSession) { if (error.status === 409) draft.rejectTarget(); message.error(error.message); } },
    });
    const moderate = async hidden => {
        if (submitLock.current || busy || !formReady || draft.conflict || draft.targetConflict || !report.data || !Number.isSafeInteger(draft.targetRevision) || report.isFetching || report.isError) return;
        const target = { reportId: selected, newsId: report.data.post?.news?.id, postId: report.data.postId, revision: draft.targetRevision, session: currentSession().epoch };
        submitLock.current = true; setValidating(true);
        try {
            const values = await form.validateFields(['visibilityReason']);
            assertCurrentSession(target.session);
            await visibility.mutateAsync({ ...target, values: { hidden, reason: values.visibilityReason.trim(), revision: target.revision } });
        } catch { /* 필드 아래에 거절 사유를 유지한다. */ }
        finally { submitLock.current = false; setValidating(false); }
    };
    const saveReview = async () => {
        if (submitLock.current || busy || !selected || report.isFetching || report.isError || !formReady || draft.conflict) return;
        const target = { reportId: selected, session: currentSession().epoch, revision: draft.revision };
        submitLock.current = true; setValidating(true);
        try {
            const values = await form.validateFields(['status', 'hold', 'note']);
            assertCurrentSession(target.session); await update.mutateAsync({ ...target, values: { ...values, revision: target.revision } });
        } catch { /* 입력 오류는 해당 칸에 남긴다. */ }
        finally { submitLock.current = false; setValidating(false); }
    };
    const busy = validating || update.isPending || visibility.isPending || draft.refreshing;
    const reasonLabel = reason => FEED_REPORT_REASONS.find(item => item.value === reason)?.label || reason;
    if (configPending || enabled && mode !== 'comments' && activeList.isPending) return <section aria-label="피드·가게 소식 신고 관리"><FeedReportsSkeleton mode={mode} status={status} auditAction={auditAction} /></section>;
    const renderList = () => {
        if (mode === 'comments') return interactions.isPending ? <FeedReportListSkeleton label="댓글 신고를 불러오는 중" />
            : interactions.isError ? <DataState state="error" title="댓글 신고 상태를 불러오지 못했어요." error={interactions.error} onRetry={interactions.refetch} retrying={interactions.isFetching} />
                : <CommentReportsPanel status={status} page={page} onPageChange={setPage} enabled={Boolean(interactions.data?.enabled)} />;
        if (configPending || enabled && activeList.isPending) return <FeedReportListSkeleton />;
        if (!enabled && (config.isError || newsConfig.isError)) return <DataState state="error" title="신고함 상태를 불러오지 못했어요."
            error={config.error || newsConfig.error} onRetry={() => Promise.all([config.refetch(), newsConfig.refetch()])} retrying={config.isFetching || newsConfig.isFetching} />;
        if (!enabled) return <DataState state="empty" title="피드·가게 소식 신고함을 준비하고 있어요." />;
        if (mode === 'audit') {
            if (audit.isError) return <DataState state="error" title="처리 기록을 불러오지 못했어요." error={audit.error} onRetry={audit.refetch} retrying={audit.isFetching} />;
            if (!audit.data?.content?.length) return <DataState state="empty" title="피드·가게 소식 처리 기록이 없어요." />;
            return <ul className="reserve-feed-report-list">{audit.data.content.map(item => <li key={item.id}>
                <div><strong>{FEED_AUDIT_ACTION_LABELS[item.action] || item.action}</strong><p>{feedDate(item.createdAt)} · 처리자 #{item.actorId}{item.postId ? ` · 게시물 #${item.postId}` : ''}{item.promotionId ? ` · 가게 소식 #${item.promotionId}` : ''}</p>
                    {item.reason && <p className="reserve-feed-post-text">{item.reason}</p>}</div>
                {item.reportId && <Button variant="outline" size="sm" disabled={busy} onClick={() => setSelected(item.reportId)}>신고 보기</Button>}
            </li>)}</ul>;
        }
        if (list.isError) return <DataState state="error" title="피드·가게 소식 신고를 불러오지 못했어요." error={list.error} onRetry={list.refetch} retrying={list.isFetching} />;
        if (!list.data?.content?.length) return <DataState state="empty" title="접수된 피드·가게 소식 신고가 없어요." />;
        return <ul className="reserve-feed-report-list">{list.data.content.map(item => <li key={item.id}>
            <div><Tag>{item.status === 'OPEN' ? '접수' : '처리 완료'}</Tag><strong>{reasonLabel(item.reason)}</strong>
                <p>{item.post?.news ? '가게 소식' : 'SNS 게시물'} · {feedDate(item.createdAt)}{item.hold ? ' · 파기 보류' : ''}</p></div>
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setSelected(item.id)}>검토</Button>
        </li>)}</ul>;
    };
    return <section aria-label="피드·가게 소식 신고 관리">
        <ManagementListToolbar leading={<SegmentedControl value={mode} options={[{ value: 'reports', label: '신고' },
            ...(interactions.data?.enabled || mode === 'comments' ? [{ value: 'comments', label: '댓글 신고' }] : []), { value: 'audit', label: '처리 기록' }]}
            onChange={value => requestAction(() => changeMode(value))} />}
            trailing={mode === 'audit' ? <FilterMenu appearance="plain" value={auditAction} options={REPORT_AUDIT_ACTION_OPTIONS}
                aria-label="피드·가게 소식 처리 종류" onChange={value => setQuery({ reportAuditAction: value, reportAuditPage: '1' })} />
                : <FilterMenu appearance="plain" value={status} options={REPORT_STATUS_OPTIONS}
                aria-label={mode === 'comments' ? '댓글 신고 상태' : '피드·가게 소식 신고 상태'} onChange={value => setQuery({
                    [mode === 'comments' ? 'commentReportStatus' : 'reportStatus']: value, [pageKey]: '1',
                })} />} />
        {renderList()}
        {mode !== 'comments' && activeList.isSuccess && feedTotal(activeList.data) > PAGE_SIZE && <Pagination current={page} total={feedTotal(activeList.data)} pageSize={PAGE_SIZE}
            showSizeChanger={false} onChange={setPage} disabled={activeList.isFetching} />}
        <FormModal title="피드·가게 소식 신고 검토" open={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }} width={760}
            rootClassName="reserve-feed-modal" submitText="처리 저장" submitting={busy} submitDisabled={!report.data || report.isFetching || report.isError || !formReady || draft.conflict}
            navigationDirty={draft.dirty} onSubmit={saveReview}>
            {draft.invalidVersion ? <DataState state="error" title="검토 정보를 불러오지 못했어요." onRetry={draft.reload} retrying={draft.refreshing} /> : report.isPending || !report.isError && !formReady ? <FeedSkeleton detail /> : report.isError ? <DataState state={report.error?.status === 404 ? 'empty' : 'error'}
                title={report.error?.status === 404 ? '신고 원문을 찾을 수 없어요.' : '신고 원문을 불러오지 못했어요.'}
                error={report.error} onRetry={report.error?.status === 404 ? undefined : report.refetch} retrying={report.isFetching} /> : report.data && <>
                <p><strong>{reasonLabel(report.data.reason)}</strong> · {feedDate(report.data.createdAt)}</p>
                <p className="reserve-feed-post-text">{report.data.detail}</p>
                <p className="reserve-feed-note">신고 시점의 글·사진이에요. 이후 게시물 수정·삭제와 별도로 보관해요.</p>
                {report.data.post && <FeedPostCard post={report.data.post} detail preview />}
                {draft.conflict && <DataState state="error" compact title="다른 관리자가 신고를 변경했어요. 다시 불러와 검토해주세요."
                    onRetry={() => requestAction(draft.reload, { discard: false })} retrying={draft.refreshing} />}
                {draft.targetConflict && !draft.conflict && <DataState state="error" compact title="게시물의 내용이나 공개 상태가 바뀌었어요. 다시 불러와 검토해주세요."
                    onRetry={() => requestAction(draft.reload, { discard: false })} retrying={draft.refreshing} />}
                <Form form={form} layout="vertical" disabled={busy}>
                    <Form.Item name="status" label="처리 상태" rules={[{ required: true, message: '처리 상태를 선택해주세요.' }]}>
                        <FormSelect options={statuses} aria-label="피드 신고 처리 상태" /></Form.Item>
                    <Form.Item name="hold" valuePropName="checked"><Checkbox>분쟁 등으로 자료 파기를 보류해요.</Checkbox></Form.Item>
                    <Form.Item name="note" label="신고 처리 이유" rules={[
                        { required: true, whitespace: true, message: '처리 이유를 입력해주세요.' }, { max: 1000, message: '1,000자 이하로 입력해주세요.' },
                    ]}><FormTextArea rows={4} maxLength={1000} aria-label="피드 신고 처리 이유" /></Form.Item>
                    <Form.Item name="visibilityReason" label="게시물 숨김·복원 이유" rules={[
                        { required: true, whitespace: true, message: '공개 상태 변경 이유를 입력해주세요.' }, { max: 500, message: '500자 이하로 입력해주세요.' },
                    ]}><FormTextArea rows={2} maxLength={500} aria-label="게시물 공개 상태 변경 이유" /></Form.Item>
                </Form>
                <div className="reserve-feed-editor-actions"><Button variant="outline" onClick={() => moderate(true)} disabled={busy || draft.conflict || draft.targetConflict || !Number.isSafeInteger(draft.targetRevision) || report.data.postState !== 'PUBLISHED'}>{report.data.post?.news ? '소식 숨김' : '게시물 숨김'}</Button>
                    <Button variant="outline" onClick={() => moderate(false)} disabled={busy || draft.conflict || draft.targetConflict || !Number.isSafeInteger(draft.targetRevision) || report.data.postState !== 'HIDDEN'}>{report.data.post?.news ? '소식 공개 복원' : '게시물 공개 복원'}</Button></div>
                <p className="reserve-feed-note">처리 완료한 일반 신고 자료는 365일 뒤 파기해요. 보류 중에는 파기하지 않으며, 보류를 해제하면 보관 기간을 다시 계산해요. 처리·열람 기록은 최소 1년 동안 보관해요.</p>
            </>}
        </FormModal>
    </section>;
}
