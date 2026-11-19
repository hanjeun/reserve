import { useContext, useEffect, useEffectEvent, useRef } from 'react';
import PropTypes from 'prop-types';
import { useMutation } from '@tanstack/react-query';
import Button from '../../components/common/Button';
import Bone from '../../components/common/Bone';
import DataState from '../../components/common/DataState';
import LoadingStatus from '../../components/common/LoadingStatus';
import Pagination from '../../components/common/Pagination';
import AnimatedContent from '../../components/common/AnimatedContent';
import TextLink from '../../components/common/TextLink';
import { DeleteOutlined, EditOutlined } from '../../components/common/icons';
import { WorkspaceActivityContext } from '../../components/layout/workspaceActivity';
import { StoreCardLayout } from '../../components/store/StoreCard';
import { StoreListRowLayout } from '../../components/store/StoreListRow';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import { assertCurrentSession, isCurrentSession } from '../../api/sessionScope';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import { httpStatusOf } from '../../utils/listErrorMessage';
import { handleApiError, isResponseUnconfirmed } from '../../utils/errorHandler';
import { FEED_PAGE_SIZE, feedDate } from '../../utils/feed';

export const DRAFT_PREVIEW_SIZE = 3;

export function DraftListSkeleton({ view = 'list' } = {}) {
    if (view === 'cards') return <div className="rsv-mystore-grid reserve-draft-list--cards" aria-hidden="true">
        {[1, 2, 3].map(card => <StoreCardLayout key={card} preview title={<Bone width="65%" height={16} />}>
            <Bone width="50%" height={12} />
        </StoreCardLayout>)}
    </div>;
    return <div className="reserve-draft-list" aria-hidden="true">
        {[1, 2, 3].map(row => <div className="reserve-draft-row" key={row}>
            <div className="reserve-draft-skeleton-copy"><Bone width="54%" height={15} /><Bone width="40%" height={12} /></div>
            <Bone width={60} height={14} />
        </div>)}
    </div>;
}
DraftListSkeleton.propTypes = { view: PropTypes.oneOf(['list', 'cards']) };

function useDraftDelete({ label, remove, refresh }) {
    const session = useAuthStore(state => state.sessionRevision);
    const active = useContext(WorkspaceActivityContext);
    const { confirm, message } = useMessage();
    const dialog = useRef(null);
    useEffect(() => () => dialog.current?.destroy(), [session, active]);
    const mutation = useMutation({ mutationFn: ({ row, revision }) => {
        assertCurrentSession(revision);
        return remove(row);
    } });
    const ask = row => {
        if (!active || dialog.current || mutation.isPending || !isCurrentSession(session)) return;
        dialog.current = confirm({
            title: `${label}을 삭제할까요?`, content: '삭제한 초안과 첨부 사진은 복원할 수 없어요.',
            okText: '삭제', okButtonProps: { danger: true },
            afterClose: () => { dialog.current = null; },
            onOk: async () => {
                if (!isCurrentSession(session)) return;
                try {
                    const deleted = await mutation.mutateAsync({ row, revision: session });
                    if (!isCurrentSession(session)) return;
                    if (deleted === false) message.warning('초안이 변경됐어요. 다시 확인해주세요.');
                    else message.success('초안을 삭제했어요.');
                    await refresh();
                } catch (error) {
                    if (!isCurrentSession(session) || error?.isStaleSession || error?.isSessionExpired) return;
                    if (httpStatusOf(error) === 409 || isResponseUnconfirmed(error)) {
                        message.warning(httpStatusOf(error) === 409 ? '초안이 변경됐어요. 다시 확인해주세요.'
                            : '삭제 결과를 확인하지 못했어요. 목록에서 다시 확인해주세요.');
                        await refresh();
                        return;
                    }
                    handleApiError(error, message, '초안을 삭제하지 못했어요.');
                    throw error;
                }
            },
        });
    };
    return { ask, deleting: mutation.isPending ? mutation.variables?.row.key : null };
}

export default function DraftList({ rows, query, total, page, onPageChange, overview, view, kind, label, emptyTitle, emptyAction, remove, refresh }) {
    const { ask, deleting } = useDraftDelete({ label, remove, refresh });
    const cards = view === 'cards';
    const lastPage = Math.max(1, Math.ceil(total / FEED_PAGE_SIZE));
    const needsPageFix = !overview && query.isSuccess && !query.isFetching && page > lastPage;
    const fixPage = useEffectEvent(value => onPageChange(value, { replace: true }));
    useEffect(() => {
        if (needsPageFix) fixPage(lastPage);
    }, [needsPageFix, lastPage]);

    const skeleton = <LoadingStatus aria-label={`${label}을 불러오는 중`} aria-busy="true">
        <DraftListSkeleton view={view} />
    </LoadingStatus>;
    if (query.isPending || needsPageFix) return skeleton;
    const blocked = isBlockingListReadError(query.error, rows);
    if (!query.isPlaceholderData && !query.error && rows.length === 0) return overview
        ? <p className="reserve-draft-empty">{emptyTitle}</p>
        : <DataState kind={kind} title={emptyTitle} action={emptyAction} />;

    const visibleRows = overview ? rows.slice(0, DRAFT_PREVIEW_SIZE) : rows;
    return <>
        {query.error && <DataState compact={overview || !blocked} state="error" kind={kind} subject={label}
            error={query.error} onRetry={query.refetch} retrying={query.isFetching} />}
        {!blocked && <>
            <AnimatedContent motionKey={String(page)} ready={!query.isPlaceholderData} keepResultsHeight={!overview && total > FEED_PAGE_SIZE}>
                {query.isPlaceholderData ? skeleton : <ul className={`reserve-draft-list ${cards ? 'rsv-mystore-grid reserve-draft-list--cards' : 'reserve-store-list-rows'}`}
                    aria-label={label} aria-busy={query.isFetching}>
                    {visibleRows.map(row => {
                        const formattedTime = feedDate(row.savedAt);
                        const details = (row.detail || formattedTime) && <span className="reserve-store-list-row-description">
                            {row.detail}{row.detail && formattedTime && ' · '}
                            {formattedTime && <><time dateTime={row.savedAt}>{formattedTime}</time> 저장</>}
                        </span>;
                        const actions = [
                            row.to && deleting !== row.key ? <TextLink key="resume" className="reserve-draft-resume-link" to={row.to}
                                state={row.resumeState} aria-label={`${row.name} 이어서 작성`}><EditOutlined aria-hidden="true" /> 이어서 작성</TextLink>
                                : <Button key="resume" variant="ghost-sm" aria-label={`${row.name} 이어서 작성`} disabled={deleting === row.key} onClick={row.resume}>
                                    <EditOutlined aria-hidden="true" /> 이어서 작성
                                </Button>,
                            <Button key="delete" variant="ghost-sm-danger" aria-label={`${row.name} 삭제`} disabled={deleting != null}
                                loading={deleting === row.key} onClick={() => ask(row)}><DeleteOutlined aria-hidden="true" /> 삭제</Button>,
                        ];
                        return <li key={row.key}>
                            {cards ? <StoreCardLayout title={row.name} actions={actions}>{details}</StoreCardLayout>
                                : <StoreListRowLayout className="reserve-mystore-list-row" title={row.name} actions={actions}>{details}</StoreListRowLayout>}
                        </li>;
                    })}
                </ul>}
            </AnimatedContent>
            {!overview && total > FEED_PAGE_SIZE && <nav className="reserve-feed-pagination" aria-label={`${label} 페이지`}>
                <Pagination current={page} total={total} pageSize={FEED_PAGE_SIZE} showSizeChanger={false}
                    onChange={value => onPageChange(value)} />
            </nav>}
        </>}
    </>;
}

DraftList.propTypes = {
    rows: PropTypes.arrayOf(PropTypes.shape({ key: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
        name: PropTypes.string.isRequired, detail: PropTypes.string, savedAt: PropTypes.string,
        resume: PropTypes.func, to: PropTypes.string, resumeState: PropTypes.object })).isRequired,
    query: PropTypes.object.isRequired,
    total: PropTypes.number.isRequired,
    page: PropTypes.number.isRequired,
    onPageChange: PropTypes.func.isRequired,
    overview: PropTypes.bool.isRequired,
    view: PropTypes.oneOf(['list', 'cards']).isRequired,
    kind: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    emptyTitle: PropTypes.string.isRequired,
    emptyAction: PropTypes.node,
    remove: PropTypes.func.isRequired,
    refresh: PropTypes.func.isRequired,
};
