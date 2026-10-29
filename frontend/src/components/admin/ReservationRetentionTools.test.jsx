import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import ReservationRetentionTools from './ReservationRetentionTools';

const state = vi.hoisted(() => ({ revision: 1, availability: { enabled: true, strongAuthentication: true },
    evidence: vi.fn(), hold: vi.fn(), release: vi.fn(), success: vi.fn() }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.availability }) }));
vi.mock('../../store/useAuthStore', () => {
    const store = selector => selector({ sessionRevision: state.revision });
    store.getState = () => ({ sessionRevision: state.revision }); return { default: store };
});
vi.mock('../../services/reservationRetentionService', () => ({ default: { availability: vi.fn(),
    evidence: (...args) => state.evidence(...args), hold: (...args) => state.hold(...args), release: (...args) => state.release(...args) } }));
vi.mock('../../hooks/useMessage', () => ({ default: () => ({ message: { success: state.success, error: vi.fn() } }) }));
vi.mock('../common', () => ({
    Button: ({ children, onClick, disabled }) => <button onClick={onClick} disabled={disabled}>{children}</button>,
    FormInput: props => <input {...props} />,
    FormSelect: ({ options, onChange, ...props }) => <select {...props} onChange={event => onChange(event.target.value)}>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
}));
vi.mock('../common/FormModal', () => ({
    default: ({ open, children, onSubmit, submitting }) => open && <section role="dialog">{children}
        <button disabled={submitting} onClick={onSubmit}>확인</button></section>,
    FormField: ({ children, error }) => <div>{children}{error && <span role="alert">{error}</span>}</div>,
}));
vi.mock('../common/ResponsiveModal', () => ({ default: ({ open, children, onCancel, afterClose }) =>
    <section data-testid="evidence-modal" data-open={String(open)}>{children}
        <button onClick={onCancel}>증거 닫기</button><button onClick={afterClose}>닫힘 완료</button></section> }));

beforeEach(() => {
    vi.clearAllMocks(); state.revision = 1;
    state.availability = { enabled: true, strongAuthentication: true };
    state.evidence.mockResolvedValue({ reservation: { reservationCode: 'SYNTHETIC-1', memberName: '합성 예약자' } });
});
it('비활성이면 도구를 숨기고 추가 인증이 없으면 실행을 차단해요', () => {
    state.availability.enabled = false;
    const view = render(<ReservationRetentionTools reservationId={1} open />);
    expect(screen.queryByRole('button', { name: '거래 증거 조회' })).toBeNull();
    state.availability = { enabled: true, strongAuthentication: false };
    view.rerender(<ReservationRetentionTools reservationId={1} open />);
    expect(screen.getByRole('button', { name: '거래 증거 조회' })).toBeDisabled();
    expect(state.evidence).not.toHaveBeenCalled();
});
it('목적을 전달하고 증거 내용은 닫힘 완료까지 보존해요', async () => {
    render(<ReservationRetentionTools reservationId={1} open />);
    fireEvent.click(screen.getByRole('button', { name: '거래 증거 조회' }));
    fireEvent.change(screen.getByLabelText('처리 목적'), { target: { value: 'CONTRACT' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '확인' })));
    expect(state.evidence).toHaveBeenCalledWith(1, 'CONTRACT');
    expect(screen.getByText('합성 예약자')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '증거 닫기' }));
    expect(screen.getByTestId('evidence-modal')).toHaveAttribute('data-open', 'false');
    expect(screen.getByText('합성 예약자')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '닫힘 완료' }));
    expect(screen.queryByText('합성 예약자')).toBeNull();
});
it('이메일 형식 참조는 필드에서 거부하고 유효한 사건 번호만 전달해요', async () => {
    render(<ReservationRetentionTools reservationId={1} open />);
    fireEvent.click(screen.getByRole('button', { name: '예약 증거 파기 보류' }));
    fireEvent.change(screen.getByLabelText('사건 참조 번호'), { target: { value: 'synthetic@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.getByRole('alert')).toBeInTheDocument(); expect(state.hold).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('사건 참조 번호'), { target: { value: 'CASE_1' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '확인' })));
    expect(state.hold).toHaveBeenCalledWith(1, 'DISPUTE', 'CASE_1');
});
it('계정 전환 뒤 늦게 온 개인정보 응답은 표시하지 않아요', async () => {
    let resolve;
    state.evidence.mockReturnValue(new Promise(done => { resolve = done; }));
    const view = render(<ReservationRetentionTools reservationId={1} open />);
    fireEvent.click(screen.getByRole('button', { name: '거래 증거 조회' }));
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    state.revision++;
    view.rerender(<ReservationRetentionTools reservationId={1} open />);
    await act(async () => resolve({ reservation: { memberName: '이전 계정 합성 예약자' } }));
    expect(screen.queryByText('이전 계정 합성 예약자')).toBeNull();
    expect(screen.getByTestId('evidence-modal')).toHaveAttribute('data-open', 'false');
});
