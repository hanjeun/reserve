import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import Pagination from '../common/Pagination';
import { Button, DataState, FilterToolbar } from '../common';
import { CloseOutlined, QrcodeOutlined } from '../common/icons';
import { ReservationRowLayout } from '../reservation/ReservationRow';
import { ReservationSummaryCardLayout } from '../reservation/ReservationSummaryCard';
import ReservationHistoryDeleteButton from '../reservation/ReservationHistoryDeleteButton';
import { ReservationStatusText } from '../reservation/ReservationStatusBadge';
import { colors } from '../../styles/tokens';
import { AnimatedListingContent } from '../common/AnimatedContent';
import ReservationListingToolbar from '../reservation/ReservationListingToolbar';
import WaitingQrModal from './WaitingQrModal';
import WaitingDetailModal from './WaitingDetailModal';
import { MY_WAITING_HELP, MyWaitingSkeleton, WaitingListSkeleton } from './WaitingSkeleton';
import { WAITING_ENTRY_LABELS as LABELS, MY_WAITING_STATUSES as STATUS_OPTIONS, MY_WAITING_SORTS as SORT_OPTIONS } from './waitingDirectoryFilters';
import useWaitingEvents from '../../hooks/useWaitingEvents';
import useListRefreshAnchor from '../../hooks/useListRefreshAnchor';
import useListSelectionMotion from '../../hooks/useListSelectionMotion';
import { keepListForSort } from '../../hooks/listSortPlaceholder';
import useLiveUpdatesStatus from '../../hooks/useLiveUpdatesStatus';
import { isBlockingListReadError, isReadAccessDenied } from '../../hooks/liveUpdateQueries';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import useViewModeParam from '../../hooks/useViewModeParam';
import useQueryParamsState from '../../hooks/useQueryParamState';
import LoadingStatus from '../common/LoadingStatus';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import useReducedMotion from '../../hooks/useReducedMotion';
import waitingService from '../../services/waitingService';
import { handleApiError, isResponseUnconfirmed } from '../../utils/errorHandler';

const FILTER_DEFAULTS = { waitingStatus: 'ALL', waitingSort: 'recent' };
const WAITING_STATUS_COLORS = { WAITING: colors.warning.main, CALLED: colors.primary.main, SEATED: colors.success.main, CANCELLED: colors.text.tertiary };

function removeWaitingFromPage(data, entryId) {
    if (!Array.isArray(data?.content)) return data;
    const content = data.content.filter(item => item.entry.id !== entryId);
    if (content.length === data.content.length) return data;
    const totalElements = Math.max(0, (data.page?.totalElements ?? data.totalElements ?? data.content.length) - 1);
    return data.page ? { ...data, content, page: { ...data.page, totalElements } } : { ...data, content, totalElements };
}
function MyWaitingSession({ revision, loggedIn, memberId }) {
    const live = useLiveUpdatesStatus();
    const isMobile = useWindowWidth() < 576;
    const reducedMotion = useReducedMotion();
    const client = useQueryClient();
    const listRef = useRef(null);
    const { message, confirm } = useMessage();
    const [params, setParams] = useSearchParams();
    const [view, setView] = useViewModeParam(params, 'list');
    const [{ waitingKeyword: keyword, waitingPage }, setSearch] = useQueryParamsState({ waitingKeyword: '', waitingPage: '1' },
        { privateKeys: ['waitingKeyword'] });
    const search = keyword.trim();
    const rawPage = Number(waitingPage);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100_000 ? rawPage - 1 : 0;
    const status = STATUS_OPTIONS.some(option => option.value === params.get('waitingStatus')) ? params.get('waitingStatus') : 'ALL';
    const sort = SORT_OPTIONS.some(option => option.value === params.get('waitingSort')) ? params.get('waitingSort') : 'recent';
    const [qrId, setQrId] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [pending, setPending] = useState(null);
    const [manualRefresh, setManualRefresh] = useState(null);
    const operation = useRef(null);
    const reloadOperation = useRef(null);
    const alive = useRef(false);
    const [toolbarReady, setToolbarReady] = useState(false);
    const mineKey = ['waiting', revision, 'my', memberId];
    const mine = useQuery({ queryKey: [...mineKey, page, { keyword: search, status, sort }],
        enabled: loggedIn,
        queryFn: ({ signal }) => waitingService.getMine(page, signal, { keyword: search, status, sort }),
        // 이전 계정의 자료를 새 세션의 첫 화면에 빌리지 않는다.
        placeholderData: (previous, query) => {
            const key = query?.queryKey;
            if (!loggedIn || !key || key[1] !== revision || key[3] !== memberId || isReadAccessDenied(query.state.error)) return undefined;
            const source = key[5];
            if (source?.keyword === search && source.status === status) {
                return keepListForSort(previous, source.sort, sort, key[4]) ?? previous;
            }
            return previous;
        },
        retry: false, staleTime: 10_000,
        refetchInterval: live.present ? false : 15_000,
        refetchIntervalInBackground: false, refetchOnWindowFocus: !live.present, refetchOnReconnect: false });
    if (!toolbarReady && loggedIn && ((mine.isSuccess && !mine.isPlaceholderData) || mine.isError)) {
        setToolbarReady(true);
    }
    useWaitingEvents(loggedIn);
    const blockingError = isBlockingListReadError(mine.error, mine.data?.content);
    const accessLost = isReadAccessDenied(mine.error);
    if (accessLost && (qrId !== null || detailId !== null)) {
        setQrId(null); setDetailId(null);
    }
    useListRefreshAnchor(listRef, `${page}:${status}:${sort}:${keyword}:${view}`, mine.isFetching, mine.data);
    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; operation.current?.abort(); reloadOperation.current = null; };
    }, []);
    const refresh = () => client.invalidateQueries({ queryKey: ['waiting', revision] });
    const refreshPrivateReads = entryId => Promise.all([
        client.invalidateQueries({ queryKey: mineKey }),
        client.invalidateQueries({ queryKey: ['unified-search', 'personal', memberId, revision] }),
        client.invalidateQueries({ queryKey: ['search-handoff', memberId, revision, 'waiting', entryId] }),
    ]);
    const currentMember = () => {
        const auth = useAuthStore.getState();
        return alive.current && loggedIn && auth.isLoggedIn && auth.sessionRevision === revision && auth.user?.id === memberId;
    };
    const refreshing = manualRefresh?.revision === revision && manualRefresh?.memberId === memberId;
    const reload = async () => {
        if (reloadOperation.current || !currentMember()) return;
        const request = { revision, memberId };
        reloadOperation.current = request;
        setManualRefresh(request);
        try { await refresh(); }
        finally {
            if (reloadOperation.current === request) {
                reloadOperation.current = null;
                if (currentMember()) setManualRefresh(null);
            }
        }
    };
    const setWaitingFilter = (key, value) => setParams(current => {
        const next = new URLSearchParams(current);
        next.set(key, value);
        if ((current.get(key) ?? FILTER_DEFAULTS[key]) !== value) next.set('waitingPage', '1');
        return next;
    }, { replace: true });
    const changeEntry = (entry, removing = false) => {
        if (operation.current || !currentMember()) return;
        const refreshEntry = () => removing ? refreshPrivateReads(entry.id) : refresh();
        confirm({
            title: removing ? '웨이팅 삭제' : `${entry.entryNumber}번 웨이팅을 취소할까요?`,
            content: removing ? '내 목록에서 삭제해요. 가게의 접수 기록은 남아요.' : '취소하면 다시 접수해야 해요.',
            okText: removing ? '삭제' : '웨이팅 취소',
            cancelText: removing ? '취소' : '돌아가기',
            okButtonProps: { danger: true },
            onOk: async () => {
                if (operation.current || !currentMember()) return;
                const controller = new AbortController();
                operation.current = controller;
                setPending(entry.id);
                try {
                    const write = removing ? waitingService.remove : waitingService.cancel;
                    await write(entry.id, controller.signal);
                    if (!currentMember() || controller.signal.aborted) return;
                    if (removing) {
                        await client.cancelQueries({ queryKey: mineKey });
                        if (!currentMember()) return;
                        client.setQueriesData({ queryKey: mineKey }, data => removeWaitingFromPage(data, entry.id));
                        setDetailId(current => current === entry.id ? null : current);
                    }
                    message.success(removing ? '내 웨이팅에서 삭제했어요.' : '웨이팅을 취소했어요.');
                    await refreshEntry();
                } catch (error) {
                    if (!currentMember() || controller.signal.aborted || error?.isStaleSession || error?.isSessionExpired) return;
                    if (removing && isResponseUnconfirmed(error)) {
                        message.warning('삭제 결과를 확인하지 못했어요. 내 웨이팅 목록에서 확인해주세요.');
                    } else {
                        handleApiError(error, message, removing ? '웨이팅을 삭제하지 못했어요.' : '웨이팅을 취소하지 못했어요.');
                    }
                    void refreshEntry();
                } finally {
                    operation.current = null;
                    if (currentMember()) setPending(null);
                }
            },
        });
    };
    const rows = loggedIn && !blockingError ? mine.data?.content || [] : [];
    const previousOrder = mine.isPlaceholderData ? mine.data?.previousOrder : undefined;
    const loading = mine.isPending || mine.isPlaceholderData && !previousOrder;
    useListSelectionMotion(listRef, {
        selection: JSON.stringify([search, status, previousOrder?.sort ?? sort]), view,
        ids: rows.map(row => row.entry.id), ready: !loading && !blockingError,
    });
    const total = loggedIn ? mine.data?.page?.totalElements ?? mine.data?.totalElements ?? 0 : 0;
    useEffect(() => {
        const lastPage = Math.max(0, Math.ceil(total / 20) - 1);
        if (!loggedIn || !mine.isSuccess || mine.isPlaceholderData || page <= lastPage) return;
        setParams(current => {
            const next = new URLSearchParams(current);
            next.set('waitingPage', String(lastPage + 1));
            return next;
        }, { replace: true });
    }, [loggedIn, total, page, mine.isSuccess, mine.isPlaceholderData, setParams]);
    const qrActive = rows.some(item => item.entry.id === qrId && item.entry.status === 'CALLED');
    const detail = rows.find(item => item.entry.id === detailId) ?? null;
    const render = (item, index) => {
        const { entry } = item;
        const active = entry.status === 'WAITING' || entry.status === 'CALLED';
        const progress = entry.status === 'WAITING' ? `내 앞에 ${item.teamsAhead}팀이 있어요.`
            : entry.status === 'CALLED' ? '가게로 와서 직원에게 입장 QR을 보여주세요.'
                : entry.status === 'SEATED' ? '입장이 완료됐어요.' : '취소한 접수예요.';
        const actions = active ? [
            entry.status === 'CALLED' && <Button key="qr" variant="ghost-sm-primary" disabled={pending != null}
                onClick={() => setQrId(entry.id)}><QrcodeOutlined aria-hidden="true" /> 입장 QR</Button>,
            <Button key="cancel" variant="ghost-sm-danger" disabled={pending != null} loading={pending === entry.id}
                onClick={() => changeEntry(entry)}><CloseOutlined aria-hidden="true" /> 취소</Button>,
        ] : entry.status === 'CANCELLED' ? [
            <ReservationHistoryDeleteButton key="remove" disabled={pending != null} loading={pending === entry.id}
                onClick={() => changeEntry(entry, true)} />,
        ] : null;
        const layout = {
            itemKey: 'waiting:' + entry.id,
            storeName: item.storeName,
            imageUrl: item.storeImageUrl,
            onOpenDetail: () => setDetailId(entry.id),
            detailLabel: `${item.storeName} ${entry.entryNumber}번 웨이팅 상세 보기`,
            statusLabel: <ReservationStatusText color={WAITING_STATUS_COLORS[entry.status]}>{LABELS[entry.status] ?? '기타'}</ReservationStatusText>,
            reference: entry.entryNumber + '번',
        };
        if (view === 'cards') return <li key={entry.id} className="reserve-myreservation-card-item">
            <ReservationSummaryCardLayout {...layout} actions={actions}>
                <div className="reserve-reservation-summary-card-meta reserve-reservation-summary-card-party"><span>{entry.partySize}명</span></div>
                <div className="reserve-reservation-summary-card-meta"><span>{progress}</span></div>
            </ReservationSummaryCardLayout>
        </li>;
        const rowProgress = entry.status === 'CALLED' ? '입장 QR을 보여주세요.' : progress;
        return <li key={entry.id} className="reserve-myreservation-row">
            <ReservationRowLayout {...layout} isWide={!isMobile}
                metadata={<span className="reserve-reservation-row-meta-text" title={progress}>{entry.partySize}명 · <span>{rowProgress}</span></span>}
                tools={actions} />
            {index < rows.length - 1 && <div className="reserve-myreservation-divider" aria-hidden="true" />}
        </li>;
    };
    const initialLoading = mine.isPending && !toolbarReady;
    if (!loggedIn) return null;
    if (initialLoading) return <MyWaitingSkeleton view={view}
        statusLabel={STATUS_OPTIONS.find(option => option.value === status).label}
        sortLabel={SORT_OPTIONS.find(option => option.value === sort).label} />;
    return <div className="reserve-waiting-tab" aria-busy={mine.isFetching}>
        <ReservationListingToolbar view={view} onViewChange={setView} label="내 웨이팅 목록 필터"
            statusAriaLabel="웨이팅 상태" sortAriaLabel="웨이팅 정렬"
            status={status} onStatusChange={next => setWaitingFilter('waitingStatus', next)} statusOptions={STATUS_OPTIONS}
            sort={sort} onSortChange={next => setWaitingFilter('waitingSort', next)} sortOptions={SORT_OPTIONS} sortLoading={Boolean(previousOrder)}
            count={blockingError ? undefined : total} disabled={false} />
        <FilterToolbar search={{ value: keyword, onSubmit: value => setSearch({ waitingKeyword: value, waitingPage: '1' }),
            placeholder: '가게명, 대기번호로 검색' }} onReload={reload} loading={refreshing} autoRefreshDomain="WAITING" />
        <AnimatedListingContent motionKey={view} ready={!loading} keepResultsHeight={total > 20} notice={<>
            <p className="reserve-waiting-form-help" role="status">{MY_WAITING_HELP}</p>
            {mine.error && mine.data && !blockingError && <DataState compact state="error" subject="내 웨이팅 갱신" error={mine.error} onRetry={refresh} retrying={mine.isFetching} />}
        </>}>
        {blockingError ? <DataState state="error" subject="내 웨이팅" error={mine.error} onRetry={refresh} retrying={mine.isFetching} />
                : loading ? <LoadingStatus aria-label="내 웨이팅 목록을 불러오는 중"><WaitingListSkeleton view={view} personal /></LoadingStatus>
                    : rows.length ? <ul ref={listRef} className={`reserve-personal-waiting-items ${view === 'cards' ? 'reserve-reservation-card-grid' : 'reserve-myreservation-rows'}`} aria-label="내 웨이팅 목록">{rows.map(render)}</ul>
                        : <DataState state="empty" kind="waiting"
                            title={status !== 'ALL' || keyword.trim() ? '조건에 맞는 웨이팅이 없어요.' : '대기 중인 웨이팅이 없어요.'}
                            description={status !== 'ALL' || keyword.trim() ? '검색어나 상태를 바꿔 다시 찾아보세요.' : '가게 상세에서 웨이팅을 접수할 수 있어요.'} />}
        </AnimatedListingContent>
        {!blockingError && total > 20 && <nav className="reserve-listing-pagination" aria-label="내 웨이팅 목록 페이지">
            <Pagination current={(previousOrder?.page ?? page) + 1} total={total} pageSize={20} showSizeChanger={false} showLessItems={isMobile}
                size={isMobile ? 'small' : 'default'} align="end" disabled={mine.isPending || mine.isPlaceholderData} onChange={next => {
                    setParams(current => {
                        const updated = new URLSearchParams(current); updated.set('waitingPage', String(next)); return updated;
                    });
                    window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
                }} />
        </nav>}
        {!accessLost && <WaitingQrModal open={qrActive} entryId={qrId} onClose={() => setQrId(null)} />}
        {!accessLost && <WaitingDetailModal detail={detail} open={Boolean(detail)} onClose={() => setDetailId(null)} />}
    </div>;
}
MyWaitingSession.propTypes = {
    revision: PropTypes.number,
    loggedIn: PropTypes.bool,
    memberId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
};

export default function MyWaiting() {
    const revision = useAuthStore(state => state.sessionRevision);
    const loggedIn = useAuthStore(state => state.isLoggedIn);
    const memberId = useAuthStore(state => state.user?.id);
    return <MyWaitingSession key={`${revision}:${memberId}:${loggedIn}`} revision={revision} loggedIn={loggedIn} memberId={memberId} />;
}
