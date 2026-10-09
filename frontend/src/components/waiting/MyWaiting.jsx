import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Pagination } from 'antd';
import { Button, Card, DataState, FilterToolbar } from '../common';
import ReservationListingToolbar from '../reservation/ReservationListingToolbar';
import WaitingQrModal from './WaitingQrModal';
import WaitingDetailModal from './WaitingDetailModal';
import { MY_WAITING_HELP, MyWaitingSkeleton, WaitingListSkeleton } from './WaitingSkeleton';
import useWaitingEvents from '../../hooks/useWaitingEvents';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import useViewModeParam from '../../hooks/useViewModeParam';
import useDebounce from '../../hooks/useDebounce';
import { useWindowWidth } from '../../hooks/useWindowWidth';
import useReducedMotion from '../../hooks/useReducedMotion';
import waitingService from '../../services/waitingService';
import { RESERVATION_SORT_OPTIONS } from '../../constants/status';

const LABELS = { WAITING: '대기 중', CALLED: '호출됨', SEATED: '입장 완료', CANCELLED: '취소됨' };
const STATUS_OPTIONS = [{ value: 'ALL', label: '전체 상태' },
    ...Object.entries(LABELS).map(([value, label]) => ({ value, label }))];
const SORT_OPTIONS = RESERVATION_SORT_OPTIONS.filter(option => option.value === 'recent' || option.value === 'oldest');
const FILTER_DEFAULTS = { waitingStatus: 'ALL', waitingSort: 'recent', waitingKeyword: '' };
function MyWaitingSession({ revision, loggedIn, memberId }) {
    const isMobile = useWindowWidth() < 576;
    const reducedMotion = useReducedMotion();
    const client = useQueryClient();
    const { message, confirm } = useMessage();
    const [params, setParams] = useSearchParams();
    const [view, setView] = useViewModeParam(params, setParams, 'list');
    const rawPage = Number(params.get('waitingPage') || 1);
    const page = Number.isSafeInteger(rawPage) && rawPage > 0 && rawPage <= 100_000 ? rawPage - 1 : 0;
    const status = STATUS_OPTIONS.some(option => option.value === params.get('waitingStatus')) ? params.get('waitingStatus') : 'ALL';
    const sort = SORT_OPTIONS.some(option => option.value === params.get('waitingSort')) ? params.get('waitingSort') : 'recent';
    const keyword = (params.get('waitingKeyword') || '').slice(0, 100);
    const debouncedKeyword = useDebounce(keyword, 300);
    const searchPending = keyword !== debouncedKeyword;
    const [qrId, setQrId] = useState(null);
    const [detailId, setDetailId] = useState(null);
    const [pending, setPending] = useState(null);
    const [manualRefresh, setManualRefresh] = useState(null);
    const operation = useRef(null);
    const reloadOperation = useRef(null);
    const alive = useRef(false);
    const [toolbarReady, setToolbarReady] = useState(false);
    const mine = useQuery({ queryKey: ['waiting', revision, 'my', memberId, page, { keyword: debouncedKeyword.trim(), status, sort }],
        enabled: loggedIn && !searchPending,
        queryFn: ({ signal }) => waitingService.getMine(page, signal, { keyword: debouncedKeyword.trim(), status, sort }),
        // 이전 계정의 자료를 새 세션의 첫 화면에 빌리지 않는다.
        placeholderData: (previous, previousQuery) => loggedIn && previousQuery?.queryKey[1] === revision
            && previousQuery.queryKey[3] === memberId ? previous : undefined,
        retry: false, staleTime: 10_000,
        refetchInterval: 15_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });
    if (!toolbarReady && loggedIn && ((mine.isSuccess && !mine.isPlaceholderData) || mine.isError)) {
        setToolbarReady(true);
    }
    useWaitingEvents(loggedIn);
    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; operation.current?.abort(); reloadOperation.current = null; };
    }, []);
    const refresh = () => client.invalidateQueries({ queryKey: ['waiting', revision] });
    const refreshing = manualRefresh?.revision === revision && manualRefresh?.memberId === memberId;
    const reload = async () => {
        const auth = useAuthStore.getState();
        if (reloadOperation.current || !loggedIn || !auth.isLoggedIn || revision !== auth.sessionRevision || memberId !== auth.user?.id) return;
        const request = { revision, memberId };
        reloadOperation.current = request;
        setManualRefresh(request);
        try { await refresh(); }
        finally {
            if (reloadOperation.current === request) {
                reloadOperation.current = null;
                const auth = useAuthStore.getState();
                if (alive.current && auth.isLoggedIn && revision === auth.sessionRevision && memberId === auth.user?.id) {
                    setManualRefresh(null);
                }
            }
        }
    };
    const setWaitingFilter = (key, value) => setParams(current => {
        const next = new URLSearchParams(current);
        if (value === FILTER_DEFAULTS[key] || !value) next.delete(key); else next.set(key, value);
        if ((current.get(key) ?? FILTER_DEFAULTS[key]) !== value) next.delete('waitingPage');
        return next;
    }, { replace: true });
    const cancel = entry => {
        if (operation.current) return;
        confirm({ title: `${entry.entryNumber}번 웨이팅을 취소할까요?`, content: '취소하면 다시 접수해야 해요.',
            okText: '웨이팅 취소', cancelText: '돌아가기', okButtonProps: { danger: true }, onOk: async () => {
                if (operation.current || revision !== useAuthStore.getState().sessionRevision) return;
                const controller = new AbortController(); operation.current = controller; setPending(entry.id);
                const current = () => alive.current && revision === useAuthStore.getState().sessionRevision;
                try {
                    await waitingService.cancel(entry.id, controller.signal);
                    if (current()) { message.success('웨이팅을 취소했어요.'); await refresh(); }
                } catch (error) {
                    if (current() && !controller.signal.aborted && !error?.isStaleSession) { message.error(error?.message || '취소하지 못했어요.'); void refresh(); }
                } finally { operation.current = null; if (current()) setPending(null); }
            } });
    };
    const rows = loggedIn ? mine.data?.content || [] : [];
    const total = loggedIn ? mine.data?.page?.totalElements ?? mine.data?.totalElements ?? 0 : 0;
    useEffect(() => {
        const lastPage = Math.max(0, Math.ceil(total / 20) - 1);
        if (!loggedIn || !mine.isSuccess || mine.isPlaceholderData || searchPending || page <= lastPage) return;
        setParams(current => {
            const next = new URLSearchParams(current);
            if (lastPage) next.set('waitingPage', String(lastPage + 1)); else next.delete('waitingPage');
            return next;
        }, { replace: true });
    }, [loggedIn, total, page, mine.isSuccess, mine.isPlaceholderData, searchPending, setParams]);
    const qrActive = rows.some(item => item.entry.id === qrId && item.entry.status === 'CALLED');
    const detail = rows.find(item => item.entry.id === detailId) ?? null;
    const render = item => {
        const { entry } = item;
        const active = entry.status === 'WAITING' || entry.status === 'CALLED';
        const content = <>
            <div className="reserve-waiting-entry-content">
                <div className="reserve-waiting-entry-head"><button type="button"
                    className="reserve-waiting-number reserve-waiting-detail-trigger reserve-tap-card__trigger"
                    aria-label={`${item.storeName} ${entry.entryNumber}번 웨이팅 상세 보기`} onClick={() => setDetailId(entry.id)}>{entry.entryNumber}번</button>
                    <span className="reserve-waiting-status" data-status={entry.status}>{LABELS[entry.status]}</span></div>
                <div className="reserve-waiting-name">{item.storeName}<span>{entry.partySize}명</span></div>
                <p className="reserve-waiting-form-help">{entry.status === 'WAITING' ? `내 앞에 ${item.teamsAhead}팀이 있어요.`
                    : entry.status === 'CALLED' ? '가게로 와서 직원에게 입장 QR을 보여주세요.'
                        : entry.status === 'SEATED' ? '입장이 완료됐어요.' : '취소한 접수예요.'}</p>
            </div>
            {active && <div className="reserve-waiting-actions">
                <Button variant="danger" size="sm" disabled={pending != null} loading={pending === entry.id} onClick={() => cancel(entry)}>취소</Button>
                {entry.status === 'CALLED' && <Button variant="primary" size="sm" disabled={pending != null} onClick={() => setQrId(entry.id)}>입장 QR</Button>}
            </div>}
        </>;
        return <li key={entry.id} className={view === 'cards' ? 'reserve-waiting-card-entry' : 'reserve-waiting-entry reserve-tap-card'}>
            {view === 'cards' ? <Card className="reserve-waiting-card reserve-tap-card"><Card.Body><div className="reserve-waiting-card-body">{content}</div></Card.Body></Card> : content}
        </li>;
    };
    const initialLoading = mine.isPending && !toolbarReady;
    if (!loggedIn) return null;
    if (initialLoading) return <MyWaitingSkeleton view={view}
        statusLabel={STATUS_OPTIONS.find(option => option.value === status).label}
        sortLabel={SORT_OPTIONS.find(option => option.value === sort).label} />;
    return <div className="reserve-waiting-tab" aria-busy={mine.isFetching || searchPending}>
        <ReservationListingToolbar view={view} onViewChange={setView} label="내 웨이팅 목록 필터"
            status={status} onStatusChange={next => setWaitingFilter('waitingStatus', next)} statusOptions={STATUS_OPTIONS}
            sort={sort} onSortChange={next => setWaitingFilter('waitingSort', next)} sortOptions={SORT_OPTIONS}
            count={mine.error ? undefined : total} disabled={false} />
        <FilterToolbar search={{ value: keyword, onChange: event => setWaitingFilter('waitingKeyword', event.target.value.slice(0, 100)),
            placeholder: '가게명, 대기번호로 검색' }} onReload={reload} loading={refreshing} />
        <p className="reserve-waiting-form-help" role="status">{MY_WAITING_HELP}</p>
        {mine.error ? <DataState state="error" subject="내 웨이팅" error={mine.error} onRetry={refresh} retrying={mine.isFetching} />
                : mine.isPending ? <WaitingListSkeleton view={view} personal />
                    : rows.length ? <ul className={`reserve-waiting-entries reserve-waiting-entries--${view}${view === 'cards' ? ' rsv-store-grid' : ''}`} aria-label="내 웨이팅 목록">{rows.map(render)}</ul>
                        : <DataState state="empty" kind="waiting"
                            title={status !== 'ALL' || debouncedKeyword.trim() ? '조건에 맞는 웨이팅이 없어요.' : '대기 중인 웨이팅이 없어요.'}
                            description={status !== 'ALL' || debouncedKeyword.trim() ? '검색어나 상태를 바꿔 다시 찾아보세요.' : '가게 상세에서 웨이팅을 접수할 수 있어요.'} />}
        {!mine.error && total > 20 && <nav className="reserve-waiting-pagination" aria-label="내 웨이팅 목록 페이지">
            <Pagination current={page + 1} total={total} pageSize={20} showSizeChanger={false} showLessItems={isMobile}
                size={isMobile ? 'small' : 'default'} disabled={mine.isFetching || searchPending} onChange={next => {
                    setParams(current => {
                        const updated = new URLSearchParams(current); updated.set('waitingPage', String(next)); return updated;
                    });
                    window.scrollTo({ top: 0, left: 0, behavior: reducedMotion ? 'instant' : 'smooth' });
                }} />
        </nav>}
        <WaitingQrModal open={qrActive} entryId={qrId} onClose={() => setQrId(null)} />
        <WaitingDetailModal detail={detail} open={Boolean(detail)} onClose={() => setDetailId(null)} />
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
