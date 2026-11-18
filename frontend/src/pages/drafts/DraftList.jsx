import { useEffect, useEffectEvent } from 'react';
import PropTypes from 'prop-types';
import Bone from '../../components/common/Bone';
import DataState from '../../components/common/DataState';
import LoadingStatus from '../../components/common/LoadingStatus';
import Pagination from '../../components/common/Pagination';
import AnimatedContent from '../../components/common/AnimatedContent';
import { isBlockingListReadError } from '../../hooks/liveUpdateQueries';
import { FEED_PAGE_SIZE, feedDate } from '../../utils/feed';

export const DRAFT_PREVIEW_SIZE = 3;

export function DraftListSkeleton() {
    return <div className="reserve-draft-list" aria-hidden="true">
        {[1, 2, 3].map(row => <div className="reserve-draft-row" key={row}>
            <div className="reserve-draft-skeleton-copy"><Bone width="54%" height={15} /><Bone width="40%" height={12} /></div>
            <Bone width={60} height={14} />
        </div>)}
    </div>;
}

export default function DraftList({ rows, query, total, page, onPageChange, overview, kind, label, emptyTitle, emptyAction }) {
    const lastPage = Math.max(1, Math.ceil(total / FEED_PAGE_SIZE));
    const needsPageFix = !overview && query.isSuccess && !query.isFetching && page > lastPage;
    const fixPage = useEffectEvent(value => onPageChange(value, { replace: true }));
    useEffect(() => {
        if (needsPageFix) fixPage(lastPage);
    }, [needsPageFix, lastPage]);

    const skeleton = <LoadingStatus aria-label={`${label}을 불러오는 중`} aria-busy="true">
        <DraftListSkeleton />
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
                {query.isPlaceholderData ? skeleton : <ul className="reserve-draft-list" aria-label={label} aria-busy={query.isFetching}>
                    {visibleRows.map(row => {
                        const formattedTime = feedDate(row.savedAt);
                        return <li className="reserve-draft-row" key={row.key}>
                            <div className="reserve-draft-row-copy">
                                <strong>{row.name}</strong>
                                {(row.detail || formattedTime) && <p>{row.detail}{row.detail && formattedTime && ' · '}
                                    {formattedTime && <><time dateTime={row.savedAt}>{formattedTime}</time> 저장</>}</p>}
                            </div>
                            {row.action}
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
        name: PropTypes.string.isRequired, detail: PropTypes.string, savedAt: PropTypes.string, action: PropTypes.node.isRequired })).isRequired,
    query: PropTypes.object.isRequired,
    total: PropTypes.number.isRequired,
    page: PropTypes.number.isRequired,
    onPageChange: PropTypes.func.isRequired,
    overview: PropTypes.bool.isRequired,
    kind: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    emptyTitle: PropTypes.string.isRequired,
    emptyAction: PropTypes.node,
};
