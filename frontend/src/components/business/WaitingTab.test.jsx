import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import WaitingTab from './WaitingTab';
import waitingService from '../../services/waitingService';

const state = vi.hoisted(() => ({ revision: 1, stores: [{ id: 5, name: '가게 A' }], success: vi.fn(), error: vi.fn(), confirm: vi.fn() }));
vi.mock('../../store/useAuthStore', () => {
    const useAuthStore = selector => selector({ sessionRevision: state.revision });
    useAuthStore.getState = () => ({ sessionRevision: state.revision });
    return { default: useAuthStore };
});
vi.mock('../../hooks', async () => ({
    useQueryParamsState: (await import('../../hooks/useQueryParamState')).useQueryParamsState,
    useMyStores: () => ({ stores: state.stores, loading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { success: state.success, error: state.error }, confirm: state.confirm }) }));
vi.mock('../../services/waitingService', () => ({ default: { getBoard: vi.fn(), create: vi.fn(), updateStatus: vi.fn() } }));
vi.mock('../common', () => {
    const Card = ({ children }) => <div>{children}</div>;
    Card.Body = ({ children }) => <div>{children}</div>;
    return {
    Card,
    Button: ({ children, onClick, disabled, loading, ...props }) => <button onClick={onClick} disabled={disabled || loading} aria-label={props['aria-label']}>{children}</button>,
    DataState: ({ title, error }) => <div>{title || error?.message}</div>,
    FilterMenu: ({ options, value, onChange, ...props }) => <select aria-label={props['aria-label']}
        value={value} onChange={event => onChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
    FilterToolbar: ({ search }) => <input placeholder={search.placeholder} value={search.value} onChange={search.onChange} />,
    FormField: ({ children, error }) => <div>{children}{error && <span role="alert">{error}</span>}</div>,
    FormInput: ({ type = 'text', value, onChange, disabled, ...props }) => <input type={type} value={value ?? ''} disabled={disabled}
        aria-label={props['aria-label']} onChange={event => onChange(type === 'number' ? event.target.valueAsNumber : event)} />,
    FormModal: ({ open, children, onClose, onSubmit, submitting, submitDisabled, submitText }) => open && <div role="dialog">
        {children}<button disabled={submitting || submitDisabled} onClick={onSubmit}>{submitText}</button><button onClick={onClose}>닫기</button></div>,
    ReservationSummaryCardSkeleton: () => <div>불러오는 중</div>,
    };
});

const board = entries => ({ storeId: 5, businessDate: '2026-10-04', entries });
const entry = (id, status = 'WAITING') => ({ id, storeId: 5, businessDate: '2026-10-04', entryNumber: id,
    displayName: null, partySize: 1, status, createdAt: '2026-10-04T08:00:00Z' });
function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const content = <QueryClientProvider client={client}><MemoryRouter initialEntries={['/business?tab=waiting']}><WaitingTab /></MemoryRouter></QueryClientProvider>;
    const view = render(content);
    return { ...view, client, updateActor: () => view.rerender(
        <QueryClientProvider client={client}><MemoryRouter initialEntries={['/business?tab=waiting']}><WaitingTab /></MemoryRouter></QueryClientProvider>) };
}

beforeEach(() => {
    state.revision = 1;
    state.stores = [{ id: 5, name: '가게 A' }];
    state.success.mockReset(); state.error.mockReset(); state.confirm.mockReset();
    waitingService.getBoard.mockReset().mockResolvedValue(board([]));
    waitingService.create.mockReset(); waitingService.updateStatus.mockReset();
});
afterEach(() => vi.restoreAllMocks());

it('blocks duplicate submissions, reuses the retry ID and changes it only after an input edit', async () => {
    const uuid = vi.spyOn(crypto, 'randomUUID').mockReturnValueOnce('a4312550-4294-4af2-b069-2797f8f81b77')
        .mockReturnValueOnce('a4312550-4294-4af2-b069-2797f8f81b78');
    let rejectFirst;
    waitingService.create.mockImplementationOnce(() => new Promise((_, reject) => { rejectFirst = reject; }))
        .mockRejectedValueOnce(new Error('일시적인 실패')).mockResolvedValueOnce(entry(1));
    const view = setup();
    fireEvent.click(await screen.findByRole('button', { name: '대기 접수' }));
    const submit = screen.getByRole('button', { name: '접수하기' });
    fireEvent.click(submit); fireEvent.click(submit);
    expect(waitingService.create).toHaveBeenCalledTimes(1);
    await act(async () => rejectFirst(new Error('응답 유실')));
    await waitFor(() => expect(submit).not.toBeDisabled());
    fireEvent.click(submit);
    await waitFor(() => expect(state.error).toHaveBeenCalledTimes(2));
    expect(waitingService.create.mock.calls[1][1].clientRequestId).toBe(waitingService.create.mock.calls[0][1].clientRequestId);
    fireEvent.change(screen.getByRole('textbox', { name: '대기 표시 이름' }), { target: { value: '새 접수' } });
    fireEvent.click(submit);
    await waitFor(() => expect(state.success).toHaveBeenCalledTimes(1));
    expect(waitingService.create.mock.calls[2][1]).toMatchObject({ displayName: '새 접수', partySize: 1,
        clientRequestId: 'a4312550-4294-4af2-b069-2797f8f81b78' });
    expect(uuid).toHaveBeenCalledTimes(2);
    view.unmount(); view.client.clear();
});

it('keeps finished entries read-only and ignores old confirmations and write responses after an account switch', async () => {
    waitingService.getBoard.mockImplementation(storeId => Promise.resolve(storeId === 5 ? board([entry(1), entry(2, 'SEATED')])
        : { storeId, businessDate: '2026-10-04', entries: [] }));
    let finish;
    waitingService.create.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const view = setup();
    expect(within(await screen.findByRole('listitem', { name: '2번 대기 접수' })).queryByRole('button')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '1번 접수 취소' }));
    const oldConfirmation = state.confirm.mock.calls[0][0];
    fireEvent.click(screen.getByRole('button', { name: '대기 접수' }));
    fireEvent.click(screen.getByRole('button', { name: '접수하기' }));
    const signal = waitingService.create.mock.calls[0][2];
    state.revision = 2; state.stores = [{ id: 6, name: '가게 B' }];
    await act(async () => view.updateActor());
    expect(signal.aborted).toBe(true);
    await act(async () => { await oldConfirmation.onOk(); finish({ ...entry(3), displayName: '이전 계정' }); });
    await screen.findByText('대기 중인 팀이 없습니다.');
    expect(waitingService.updateStatus).not.toHaveBeenCalled();
    expect(state.success).not.toHaveBeenCalled();
    expect(state.error).not.toHaveBeenCalled();
    expect(view.client.getQueryData(['waiting', 2, 6]).entries).toEqual([]);
    expect(screen.queryByText('이전 계정')).toBeNull();
    view.unmount(); view.client.clear();
});

it('filters the loaded board by name and waiting number without issuing another network request', async () => {
    waitingService.getBoard.mockResolvedValue(board([
        { ...entry(1), displayName: '김손님' },
        { ...entry(2), displayName: '이손님' },
        { ...entry(3, 'SEATED'), displayName: '종료 손님' },
    ]));
    const view = setup();
    await screen.findByRole('listitem', { name: '1번 대기 접수' });
    const search = screen.getByPlaceholderText('이름, 대기번호로 검색');
    fireEvent.change(search, { target: { value: '김손님' } });
    expect(screen.getByRole('listitem', { name: '1번 대기 접수' })).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: '2번 대기 접수' })).toBeNull();
    fireEvent.change(search, { target: { value: '2번' } });
    expect(screen.getByRole('listitem', { name: '2번 대기 접수' })).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: '1번 대기 접수' })).toBeNull();
    fireEvent.change(search, { target: { value: '없는 이름' } });
    expect(screen.getByText('검색에 맞는 대기 중인 팀이 없습니다.')).toBeInTheDocument();
    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getByRole('listitem', { name: '3번 대기 접수' })).toBeInTheDocument();
    expect(waitingService.getBoard).toHaveBeenCalledTimes(1);
    view.unmount(); view.client.clear();
});
