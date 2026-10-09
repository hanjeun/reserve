import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, DataState, FilterMenu, FilterToolbar, FormField, FormInput, FormModal } from '../common';
import StoreListViewToggle from '../store/StoreListViewToggle';
import { useMyStores, useQueryParamsState } from '../../hooks';
import useViewModeParam from '../../hooks/useViewModeParam';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import waitingService from '../../services/waitingService';
import useWaitingEvents from '../../hooks/useWaitingEvents';
import WaitingQrModal from '../waiting/WaitingQrModal';
import { WaitingTabSkeleton } from '../waiting/WaitingSkeleton';

const QUERY_DEFAULTS = Object.freeze({ waitingStore: '', waitingSearch: '', waitingStatus: 'ACTIVE' });
const STATUS_LABELS = Object.freeze({ WAITING: '대기 중', CALLED: '호출됨', SEATED: '입장 완료', CANCELLED: '취소됨' });
const STATUS_OPTIONS = Object.freeze([
    { value: 'ACTIVE', label: '진행 중' },
    { value: 'ALL', label: '전체 상태' },
    ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
]);
const KST_TIME = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const isActive = entry => entry.status === 'WAITING' || entry.status === 'CALLED';
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '')
    ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일` : '';
const timeLabel = value => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? KST_TIME.format(date) : '';
};

function WaitingEntry({ entry, businessDate, view, busy, changing, onChange, onCancel }) {
    const active = isActive(entry);
    const content = <div className="reserve-waiting-entry-content">
            <div className="reserve-waiting-entry-head">
                <strong className="reserve-waiting-number">{entry.entryNumber}번</strong>
                <span className="reserve-waiting-status" data-status={entry.status}>{STATUS_LABELS[entry.status] || '상태 확인'}</span>
            </div>
            <div className="reserve-waiting-name">{entry.displayName || '이름 미입력'}<span>{entry.partySize}명</span></div>
            <div className="reserve-waiting-times">
                {entry.businessDate !== businessDate && <span>{dateLabel(entry.businessDate)} 접수</span>}
                <span>접수 <time dateTime={entry.createdAt}>{timeLabel(entry.createdAt)}</time></span>
                {entry.calledAt && <span>호출 <time dateTime={entry.calledAt}>{timeLabel(entry.calledAt)}</time></span>}
                {entry.finishedAt && <span>{entry.status === 'SEATED' ? '입장' : '취소'} <time dateTime={entry.finishedAt}>{timeLabel(entry.finishedAt)}</time></span>}
            </div>
        </div>;
    const actions = active && <div className="reserve-waiting-actions">
            <Button variant="danger" size="sm" disabled={busy}
                aria-label={`${entry.entryNumber}번 접수 취소`} onClick={() => onCancel(entry)}>취소</Button>
            <Button variant="primary" size="sm" disabled={busy} loading={changing}
                aria-label={`${entry.entryNumber}번 ${entry.status === 'WAITING' ? '호출' : '입장 처리'}`}
                onClick={() => onChange(entry, entry.status === 'WAITING' ? 'CALLED' : 'SEATED')}>
                {entry.status === 'WAITING' ? '호출' : '입장'}
            </Button>
        </div>;
    return <li className={view === 'cards' ? 'reserve-waiting-card-entry' : 'reserve-waiting-entry'}
        aria-label={`${entry.entryNumber}번 대기 접수`}>
        {view === 'cards' ? <Card className="reserve-waiting-card">
            <Card.Body><div className="reserve-waiting-card-body">{content}{actions}</div></Card.Body>
        </Card> : <>{content}{actions}</>}
    </li>;
}
WaitingEntry.propTypes = { entry: PropTypes.object.isRequired, businessDate: PropTypes.string,
    view: PropTypes.oneOf(['list', 'cards']).isRequired,
    busy: PropTypes.bool, changing: PropTypes.bool, onChange: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired };

function WaitingBoard({ store, stores, storesLoading, storesError, refetchStores, onStoreChange,
    revision, view, onViewChange, search, onSearchChange, status, onStatusChange }) {
    const storeId = store?.id;
    const queryClient = useQueryClient();
    const { message, confirm } = useMessage();
    const alive = useRef(true);
    const controllers = useRef(new Set());
    const operation = useRef(null);
    const [pending, setPending] = useState(null);
    const [open, setOpen] = useState(false);
    const [qrOpen, setQrOpen] = useState(false);
    useWaitingEvents(Boolean(storeId) && !storesError);
    const [draft, setDraft] = useState({ displayName: '', partySize: 1 });
    const [fieldErrors, setFieldErrors] = useState({});
    const clientRequestId = useRef(null);
    const queryKey = ['waiting', revision, storeId];
    const board = useQuery({ queryKey, queryFn: ({ signal }) => waitingService.getBoard(storeId, signal),
        enabled: Boolean(storeId) && !storesError, retry: false, staleTime: 10_000,
        refetchInterval: 30_000, refetchIntervalInBackground: false, refetchOnWindowFocus: true });

    useEffect(() => {
        alive.current = true;
        const requests = controllers.current;
        return () => { alive.current = false; requests.forEach(controller => controller.abort()); requests.clear(); };
    }, []);
    const isCurrent = () => alive.current && revision === useAuthStore.getState().sessionRevision;
    const refresh = () => queryClient.invalidateQueries({ queryKey, exact: true });

    const write = async (key, send, success, afterSuccess) => {
        if (!isCurrent() || operation.current !== null || !storeId || storesError) return;
        const controller = new AbortController();
        controllers.current.add(controller);
        operation.current = key;
        setPending(key);
        try {
            const saved = await send(controller.signal);
            if (!isCurrent()) return;
            queryClient.setQueryData(queryKey, current => {
                if (!current || saved?.storeId !== storeId || !saved.id) return current;
                const exists = current.entries.some(entry => entry.id === saved.id);
                return { ...current, entries: exists ? current.entries.map(entry => entry.id === saved.id ? saved : entry)
                    : [...current.entries, saved] };
            });
            if (key === 'intake' && saved?.storeId === storeId && Array.isArray(saved.entries)) {
                queryClient.setQueryData(queryKey, saved);
                void refetchStores();
            }
            afterSuccess?.(saved);
            message.success(success);
            void refresh();
        } catch (error) {
            if (!isCurrent() || error?.isStaleSession || controller.signal.aborted) return;
            message.error(error?.message || '처리하지 못했어요. 다시 시도해주세요.');
            void refresh();
        } finally {
            controllers.current.delete(controller);
            operation.current = null;
            if (isCurrent()) setPending(null);
        }
    };
    const changeStatus = (entry, status) => write(entry.id,
        signal => waitingService.updateStatus(storeId, entry.id, status, signal),
        status === 'CALLED' ? `${entry.entryNumber}번을 호출했어요.` : `${entry.entryNumber}번을 입장 처리했어요.`);
    const cancel = entry => {
        if (!isCurrent() || operation.current !== null || !isActive(entry)) return;
        confirm({ title: `${entry.entryNumber}번 접수를 취소할까요?`, content: '취소한 접수는 다시 대기 상태로 바꿀 수 없어요.',
            okText: '접수 취소', cancelText: '돌아가기', okButtonProps: { danger: true },
            onOk: () => write(entry.id, signal => waitingService.updateStatus(storeId, entry.id, 'CANCELLED', signal), '대기 접수를 취소했어요.') });
    };
    const changeDraft = (key, value) => {
        if (operation.current !== null) return;
        if (draft[key] !== value) clientRequestId.current = null;
        setDraft(current => ({ ...current, [key]: value }));
        setFieldErrors({});
    };
    const submit = () => {
        if (!isCurrent() || operation.current !== null) return;
        const displayName = draft.displayName.trim();
        const partySize = draft.partySize;
        const errors = {};
        if (displayName.length > 40) errors.displayName = '표시 이름은 40자까지 입력해주세요.';
        if (!Number.isInteger(partySize) || partySize < 1 || partySize > 100) errors.partySize = '인원은 1명부터 100명까지 입력해주세요.';
        setFieldErrors(errors);
        if (Object.keys(errors).length) return;
        clientRequestId.current ??= crypto.randomUUID();
        return write('create', signal => waitingService.create(storeId,
            { displayName: displayName || undefined, partySize, clientRequestId: clientRequestId.current }, signal),
        '대기 접수를 등록했어요.', () => { setOpen(false); clientRequestId.current = null; });
    };
    const showForm = () => {
        if (!isCurrent() || operation.current !== null) return;
        setDraft({ displayName: '', partySize: 1 });
        setFieldErrors({});
        clientRequestId.current = null;
        setOpen(true);
    };
    const entries = board.data?.entries || [];
    const active = entries.filter(isActive);
    const keyword = search.trim().toLocaleLowerCase('ko-KR');
    const matches = entry => !keyword || `${entry.entryNumber}번 ${entry.displayName || '이름 미입력'}`
        .toLocaleLowerCase('ko-KR').includes(keyword);
    const visibleEntries = entries.filter(entry => matches(entry)
        && (status === 'ALL' || (status === 'ACTIVE' ? isActive(entry) : entry.status === status)));
    const entryClass = `reserve-waiting-entries reserve-waiting-entries--${view}${view === 'cards' ? ' rsv-store-grid' : ''}`;
    const busy = pending !== null;
    const paused = board.data?.waitingPaused === true;
    const intakeMode = board.data?.waitingIntakeMode ?? store?.waitingIntakeMode ?? 'OFF';
    if (storesLoading || board.isLoading) return <WaitingTabSkeleton view={view} />;
    let content;
    if (storesError) content = <DataState state="error" kind="store" subject="가게 목록" error={storesError} onRetry={refetchStores} />;
    else if (!store) content = <DataState state="empty" kind="store" title="등록된 가게가 없어요." />;
    else if (board.error && !board.data) content = <DataState state="error" subject="대기 명단" error={board.error} onRetry={refresh} retrying={board.isFetching} />;
    else content = <>
        {board.error && <DataState state="error" subject="대기 명단 갱신" error={board.error} onRetry={refresh} retrying={board.isFetching} compact />}
        <div className="reserve-waiting-summary">
            <div><h3>대기 명단</h3><p>{dateLabel(board.data?.businessDate)} · 대기 {active.filter(entry => entry.status === 'WAITING').length}팀 · 호출 {active.filter(entry => entry.status === 'CALLED').length}팀</p></div>
            <div className="reserve-waiting-actions">
                <Button variant={paused ? 'primary' : 'outline'} size="sm" disabled={busy} loading={pending === 'intake'}
                    onClick={() => write('intake', signal => waitingService.updateIntake(storeId, !paused, signal),
                        paused ? '웨이팅 접수를 시작했어요.' : '신규 접수를 중지했어요. 기존 대기는 유지돼요.')}>
                    {paused ? '접수 시작' : '접수 중지'}
                </Button>
                {['ONSITE', 'BOTH'].includes(intakeMode) && <Button variant="outline" size="sm" disabled={paused || busy} onClick={() => setQrOpen(true)}>현장 접수 QR</Button>}
                <Button variant="primary" size="sm" disabled={busy || paused} onClick={showForm}>대기 접수</Button>
            </div>
        </div>
        <p className="reserve-waiting-form-help" role="status">{paused ? '신규 접수를 잠시 중지했어요. 기존 대기는 호출·입장 처리할 수 있어요.'
            : intakeMode === 'OFF' ? '직원 접수를 받고 있어요. 고객 접수 방식은 가게 수정에서 설정할 수 있어요.' : '웨이팅 접수를 받고 있어요.'}</p>
        {visibleEntries.length ? <ul className={entryClass} aria-label="대기 접수 목록">
            {visibleEntries.map(entry => <WaitingEntry key={entry.id} entry={entry} businessDate={board.data?.businessDate} view={view}
                busy={busy} changing={pending === entry.id} onChange={changeStatus} onCancel={cancel} />)}
        </ul> : <DataState state="empty" kind="waiting"
            title={keyword ? '검색에 맞는 대기 접수가 없어요.'
                : status === 'ACTIVE' ? '대기 중인 팀이 없어요.' : '선택한 상태의 대기 접수가 없어요.'}
            description={keyword ? '이름이나 대기번호를 다시 확인해주세요.'
                : status === 'ACTIVE' ? '손님이 오면 대기 접수를 등록해주세요.' : '다른 상태를 선택해 확인해주세요.'} />}
    </>;

    return <div className="reserve-waiting-tab">
        <div className="reserve-explore-filters reserve-waiting-filters" aria-label="웨이팅 목록 필터">
            <div className="reserve-waiting-view-toggle">
                <StoreListViewToggle view={view} onChange={onViewChange} disabled={storesLoading || board.isLoading} />
            </div>
            <div className="reserve-waiting-filter-options">
                <FilterMenu appearance="plain" aria-label="웨이팅을 관리할 가게"
                    value={storeId ? String(storeId) : undefined} onChange={onStoreChange}
                    options={stores.map(item => ({ value: String(item.id), label: item.name }))}
                    disabled={storesLoading || Boolean(storesError)} loading={storesLoading} />
                <FilterMenu appearance="plain" aria-label="대기 접수 상태" value={status}
                    onChange={onStatusChange} options={STATUS_OPTIONS} disabled={storesLoading || Boolean(storesError)} />
            </div>
        </div>
        <FilterToolbar search={{ value: search, onChange: onSearchChange, placeholder: '이름, 대기번호로 검색' }}
            onReload={store ? refresh : refetchStores} loading={storesLoading || board.isFetching} />
        {content}
        <WaitingQrModal open={qrOpen} storeId={storeId} onClose={() => setQrOpen(false)} />
        <FormModal title="대기 접수" open={open} mobileSize="content" width={440}
            onClose={() => { if (operation.current === null) setOpen(false); }} onSubmit={submit}
            submitting={pending === 'create'} submitText="접수하기" submitDisabled={busy}>
            <p className="reserve-waiting-form-help">이름 없이 대기번호로도 접수할 수 있어요.</p>
            <FormField label="표시 이름 (선택)" error={fieldErrors.displayName}>
                <FormInput aria-label="대기 표시 이름" value={draft.displayName} maxLength={40} showCount disabled={busy}
                    placeholder="이름 또는 별칭" autoComplete="off" onChange={event => changeDraft('displayName', event.target.value)} />
            </FormField>
            <FormField label="인원" error={fieldErrors.partySize}>
                <FormInput type="number" aria-label="대기 인원" value={draft.partySize} min={1} max={100} precision={0}
                    suffix="명" inputMode="numeric" disabled={busy} onChange={value => changeDraft('partySize', value)} />
            </FormField>
        </FormModal>
    </div>;
}
WaitingBoard.propTypes = { store: PropTypes.object, stores: PropTypes.array.isRequired, storesLoading: PropTypes.bool,
    storesError: PropTypes.object, refetchStores: PropTypes.func.isRequired, onStoreChange: PropTypes.func.isRequired,
    revision: PropTypes.number.isRequired, view: PropTypes.string.isRequired, onViewChange: PropTypes.func.isRequired,
    search: PropTypes.string.isRequired, onSearchChange: PropTypes.func.isRequired,
    status: PropTypes.string.isRequired, onStatusChange: PropTypes.func.isRequired };

export default function WaitingTab() {
    const { stores, loading, error, refetch } = useMyStores();
    const revision = useAuthStore(state => state.sessionRevision);
    const [{ waitingStore, waitingSearch, waitingStatus }, setParams] = useQueryParamsState(QUERY_DEFAULTS);
    const [searchParams, setSearchParams] = useSearchParams();
    const [view, setView] = useViewModeParam(searchParams, setSearchParams, 'list');
    const store = stores.find(item => String(item.id) === waitingStore) ?? stores[0] ?? null;
    return <WaitingBoard key={`${revision}:${store?.id ?? 'none'}`} store={store} stores={stores}
        storesLoading={loading} storesError={error} refetchStores={refetch}
        onStoreChange={value => setParams({ waitingStore: String(value) })} revision={revision} view={view} onViewChange={setView}
        search={waitingSearch} onSearchChange={event => setParams({ waitingSearch: event.target.value })}
        status={STATUS_OPTIONS.some(option => option.value === waitingStatus) ? waitingStatus : 'ACTIVE'}
        onStatusChange={value => setParams({ waitingStatus: value })} />;
}
