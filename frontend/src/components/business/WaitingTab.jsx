import { useEffect, useRef, useState } from 'react';
import PropTypes from 'prop-types';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusOutlined } from '@ant-design/icons';
import { Button, DataState, FilterToolbar, FormField, FormInput, FormModal,
    ReservationSummaryCardSkeleton, SegmentedControl } from '../common';
import { useMyStores, useQueryParamsState } from '../../hooks';
import useViewModeParam from '../../hooks/useViewModeParam';
import useMessage from '../../hooks/useMessage';
import useAuthStore from '../../store/useAuthStore';
import waitingService from '../../services/waitingService';

const QUERY_DEFAULTS = Object.freeze({ waitingStore: '' });
const STATUS_LABELS = Object.freeze({ WAITING: '대기 중', CALLED: '호출됨', SEATED: '입장 완료', CANCELLED: '취소됨' });
const VIEW_OPTIONS = Object.freeze([{ value: 'list', label: '목록' }, { value: 'cards', label: '카드' }]);
const KST_TIME = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const isActive = entry => entry.status === 'WAITING' || entry.status === 'CALLED';
const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '')
    ? `${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일` : '';
const timeLabel = value => {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? KST_TIME.format(date) : '';
};

function WaitingEntry({ entry, businessDate, busy, changing, onChange, onCancel }) {
    const active = isActive(entry);
    return <li className="reserve-waiting-entry" aria-label={`${entry.entryNumber}번 대기 접수`}>
        <div className="reserve-waiting-entry-content">
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
        </div>
        {active && <div className="reserve-waiting-actions">
            <Button variant="ghost-sm-danger" size="sm" disabled={busy}
                aria-label={`${entry.entryNumber}번 접수 취소`} onClick={() => onCancel(entry)}>취소</Button>
            <Button variant="primary" size="sm" disabled={busy} loading={changing}
                aria-label={`${entry.entryNumber}번 ${entry.status === 'WAITING' ? '호출' : '입장 처리'}`}
                onClick={() => onChange(entry, entry.status === 'WAITING' ? 'CALLED' : 'SEATED')}>
                {entry.status === 'WAITING' ? '호출' : '입장'}
            </Button>
        </div>}
    </li>;
}
WaitingEntry.propTypes = { entry: PropTypes.object.isRequired, businessDate: PropTypes.string,
    busy: PropTypes.bool, changing: PropTypes.bool, onChange: PropTypes.func.isRequired, onCancel: PropTypes.func.isRequired };

function WaitingBoard({ store, stores, storesLoading, storesError, refetchStores, onStoreChange, revision, view, onViewChange }) {
    const storeId = store?.id;
    const queryClient = useQueryClient();
    const { message, confirm } = useMessage();
    const alive = useRef(true);
    const controllers = useRef(new Set());
    const operation = useRef(null);
    const [pending, setPending] = useState(null);
    const [open, setOpen] = useState(false);
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
            afterSuccess?.(saved);
            message.success(success);
            void refresh();
        } catch (error) {
            if (!isCurrent() || error?.isStaleSession || controller.signal.aborted) return;
            message.error(error?.message || '처리하지 못했습니다. 다시 시도해주세요.');
            void refresh();
        } finally {
            controllers.current.delete(controller);
            operation.current = null;
            if (isCurrent()) setPending(null);
        }
    };
    const changeStatus = (entry, status) => write(entry.id,
        signal => waitingService.updateStatus(storeId, entry.id, status, signal),
        status === 'CALLED' ? `${entry.entryNumber}번을 호출했습니다.` : `${entry.entryNumber}번을 입장 처리했습니다.`);
    const cancel = entry => {
        if (!isCurrent() || operation.current !== null || !isActive(entry)) return;
        confirm({ title: `${entry.entryNumber}번 접수를 취소할까요?`, content: '취소한 접수는 다시 대기 상태로 바꿀 수 없습니다.',
            okText: '접수 취소', cancelText: '돌아가기', okButtonProps: { danger: true },
            onOk: () => write(entry.id, signal => waitingService.updateStatus(storeId, entry.id, 'CANCELLED', signal), '대기 접수를 취소했습니다.') });
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
        '대기 접수를 등록했습니다.', () => { setOpen(false); clientRequestId.current = null; });
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
    const finished = entries.filter(entry => !isActive(entry));
    const busy = pending !== null;
    let content;
    if (storesLoading || board.isLoading) content = <ReservationSummaryCardSkeleton count={3} />;
    else if (storesError) content = <DataState state="error" kind="store" subject="가게 목록" error={storesError} onRetry={refetchStores} />;
    else if (!store) content = <DataState state="empty" kind="store" title="등록된 가게가 없습니다." />;
    else if (board.error && !board.data) content = <DataState state="error" subject="대기 명단" error={board.error} onRetry={refresh} retrying={board.isFetching} />;
    else content = <>
        {board.error && <DataState state="error" subject="대기 명단 갱신" error={board.error} onRetry={refresh} retrying={board.isFetching} compact />}
        <div className="reserve-waiting-summary">
            <div><h3>대기 명단</h3><p>{dateLabel(board.data?.businessDate)} · 대기 {active.filter(entry => entry.status === 'WAITING').length}팀 · 호출 {active.filter(entry => entry.status === 'CALLED').length}팀</p></div>
            <Button variant="primary" size="sm" icon={<PlusOutlined />} disabled={busy} onClick={showForm}>대기 접수</Button>
        </div>
        {active.length ? <ul className={`reserve-waiting-entries reserve-waiting-entries--${view}`} aria-label="진행 중인 대기 접수">
            {active.map(entry => <WaitingEntry key={entry.id} entry={entry} businessDate={board.data?.businessDate}
                busy={busy} changing={pending === entry.id} onChange={changeStatus} onCancel={cancel} />)}
        </ul> : <DataState state="empty" title="대기 중인 팀이 없습니다." description="손님이 오면 대기 접수를 등록해주세요." compact />}
        {finished.length > 0 && <section className="reserve-waiting-finished" aria-label="오늘 종료된 대기 접수">
            <h3>오늘 처리한 접수 <span>{finished.length}팀</span></h3>
            <ul className={`reserve-waiting-entries reserve-waiting-entries--${view}`}>
                {finished.map(entry => <WaitingEntry key={entry.id} entry={entry} businessDate={board.data?.businessDate}
                    busy={busy} onChange={changeStatus} onCancel={cancel} />)}
            </ul>
        </section>}
    </>;

    return <div className="reserve-waiting-tab">
        <FilterToolbar selects={[{ key: 'store', value: storeId ? String(storeId) : undefined,
            onChange: onStoreChange, options: stores.map(item => ({ value: String(item.id), label: item.name })),
            ariaLabel: '웨이팅을 관리할 가게', width: 200, disabled: storesLoading || Boolean(storesError), loading: storesLoading }]}
            extra={<SegmentedControl options={VIEW_OPTIONS} value={view} onChange={onViewChange} block={false} />}
            onReload={store ? refresh : refetchStores} loading={storesLoading || board.isFetching} />
        {content}
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
    revision: PropTypes.number.isRequired, view: PropTypes.string.isRequired, onViewChange: PropTypes.func.isRequired };

export default function WaitingTab() {
    const { stores, loading, error, refetch } = useMyStores();
    const revision = useAuthStore(state => state.sessionRevision);
    const [{ waitingStore }, setParams] = useQueryParamsState(QUERY_DEFAULTS);
    const [searchParams, setSearchParams] = useSearchParams();
    const [view, setView] = useViewModeParam(searchParams, setSearchParams, 'list');
    const store = stores.find(item => String(item.id) === waitingStore) ?? stores[0] ?? null;
    return <WaitingBoard key={`${revision}:${store?.id ?? 'none'}`} store={store} stores={stores}
        storesLoading={loading} storesError={error} refetchStores={refetch}
        onStoreChange={value => setParams({ waitingStore: String(value) })} revision={revision} view={view} onViewChange={setView} />;
}
