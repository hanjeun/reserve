import React, { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReservationPanel, TimeSlotPicker } from './StoreDetail';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../api/axios', () => ({ default: api }));
vi.mock('@ant-design/icons', () => ({
    PlusOutlined: () => null, MinusOutlined: () => null, ClockCircleOutlined: () => null,
    CreditCardOutlined: () => null, FieldTimeOutlined: () => null, ThunderboltOutlined: () => null,
    RollbackOutlined: () => null, HourglassOutlined: () => null, TeamOutlined: () => null,
    StarFilled: () => null, EnvironmentOutlined: () => null, MessageOutlined: () => null,
}));
vi.mock('../../components/common', async () => ({
    Button: (await import('../../components/common/Button')).default,
    Bone: () => <div />,
    PageContainer: () => null, FormTextArea: () => null, FavoriteButton: () => null,
    Badge: () => null, KakaoMap: () => null, StoreDetailSkeleton: () => null,
    DataState: ({ state = 'empty', title, onRetry }) => (
        <section role={state === 'error' ? 'alert' : undefined}>
            <span>{title}</span>
            {onRetry && <button type="button" onClick={onRetry}>다시 불러오기</button>}
        </section>
    ),
}));
vi.mock('../../components/store', () => ({ BookingCalendar: () => null }));
vi.mock('../../components/review', () => ({ ReviewList: () => null }));
vi.mock('../../hooks', () => ({
    useStoreData: vi.fn(), useMessage: vi.fn(), usePayment: vi.fn(), useWindowWidth: vi.fn(),
    useStoreDetailActions: vi.fn(), useStoreImageHint: vi.fn(),
}));
vi.mock('../../utils', () => ({ getDetailImageUrl: value => value }));

const store = { id: 12, bookingType: 'SLOT' };
const dateA = dayjs('2026-10-01');
const dateB = dayjs('2026-10-02');
const editingReservation = { id: 91, storeId: 12, reservationDate: '2026-10-01', reservationTime: '10:00:00' };
const slot = (time = '10:00', available = true) => ({ time, available });
const deferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
};
const fakeForm = () => ({ getFieldValue: vi.fn(), setFields: vi.fn() });
const picker = props => <Form><Form.Item><TimeSlotPicker store={store} dateValue={dateA} {...props} /></Form.Item></Form>;

function PanelHarness({ initialTime, onForm, onFinish, bookingType = 'SLOT', initialDate = dateA, editingReservation: editing }) {
    const [form] = Form.useForm();
    useEffect(() => {
        form.setFieldsValue({ reservationDate: initialDate, reservationTime: initialTime });
        onForm(form);
    }, [form, initialTime, initialDate, onForm]);
    return <ReservationPanel store={{ ...store, bookingType }} form={form} onFinish={onFinish} isPC={false} isEditMode editingReservation={editing} />;
}

describe('time slot lookup and submission boundaries', () => {
    beforeEach(() => api.get.mockReset());

    it('separates successful no-slot results from lookup failure', async () => {
        api.get.mockResolvedValue([]);
        render(picker({ form: fakeForm() }));
        expect(await screen.findByText('예약 가능한 시간이 없어요')).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: '다시 불러오기' })).not.toBeInTheDocument();
    });

    it('clears a failed prefilled time and retries only the current date', async () => {
        api.get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([slot()]);
        const form = fakeForm();
        const onChange = vi.fn();
        render(picker({ form, value: '10:00', onChange }));
        expect(await screen.findByRole('alert')).toHaveTextContent('예약 가능한 시간을 불러오지 못했어요');
        expect(form.setFields).toHaveBeenCalledWith([{ name: 'reservationTime', value: undefined, errors: [] }]);
        expect(screen.queryByText('예약 가능한 시간이 없어요')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
        expect(onChange).toHaveBeenCalledWith('10:00');
        expect(api.get).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ params: { storeId: 12, date: '2026-10-01' } }));
    });

    it('does not auto-fill a DAY time from the previous date while the next date is pending', async () => {
        const next = deferred();
        api.get.mockResolvedValueOnce([slot()]).mockReturnValueOnce(next.promise);
        const onChange = vi.fn();
        const form = fakeForm();
        const dayStore = { ...store, bookingType: 'DAY' };
        const rendered = render(picker({ store: dayStore, form, onChange }));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith('10:00'));
        onChange.mockClear();
        rendered.rerender(picker({ store: dayStore, dateValue: dateB, form, onChange }));
        expect(screen.getByRole('status', { name: '예약 가능한 시간을 불러오는 중' })).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
        expect(form.setFields).toHaveBeenCalledWith([{ name: 'reservationTime', value: undefined, errors: [] }]);
        await act(async () => next.resolve([slot('11:00')]));
        await waitFor(() => expect(onChange).toHaveBeenCalledWith('11:00'));
        expect(onChange).not.toHaveBeenCalledWith('10:00');
    });

    it('ignores late failures for an older date without clearing the current selection', async () => {
        const old = deferred();
        api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce([slot('11:00')]);
        const form = fakeForm();
        const rendered = render(picker({ form }));
        rendered.rerender(picker({ dateValue: dateB, form }));
        expect(await screen.findByRole('button', { name: '11:00' })).toBeInTheDocument();
        form.setFields.mockClear();
        await act(async () => old.reject(new Error('old date failed')));
        expect(screen.getByRole('button', { name: '11:00' })).toBeInTheDocument();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(form.setFields).not.toHaveBeenCalled();
        expect(api.get.mock.calls[0][1].signal.aborted).toBe(true);
    });

    it('ignores late successes for a previous date', async () => {
        const old = deferred();
        api.get.mockReturnValueOnce(old.promise).mockResolvedValueOnce([slot('11:00')]);
        const rendered = render(picker({ form: fakeForm() }));
        rendered.rerender(picker({ dateValue: dateB, form: fakeForm() }));
        expect(await screen.findByRole('button', { name: '11:00' })).toBeInTheDocument();
        await act(async () => old.resolve([slot('10:00')]));
        expect(screen.queryByRole('button', { name: '10:00' })).not.toBeInTheDocument();
    });

    it('never auto-fills a server-closed DAY slot', async () => {
        api.get.mockResolvedValue([slot('10:00', false)]);
        const onChange = vi.fn();
        render(picker({ store: { ...store, bookingType: 'DAY' }, form: fakeForm(), onChange }));
        expect(await screen.findByText('이 날은 예약이 마감됐어요')).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });

    it('preserves a valid edit prefill but clears a server-rejected one', async () => {
        api.get.mockResolvedValue([slot()]);
        const form = fakeForm();
        form.getFieldValue.mockReturnValue('10:00');
        const rendered = render(picker({ form, value: '10:00' }));
        expect(await screen.findByRole('button', { name: '10:00' })).toBeInTheDocument();
        expect(form.setFields).not.toHaveBeenCalled();
        form.getFieldValue.mockReturnValue('09:00');
        rendered.rerender(picker({ form, dateValue: dateB, value: '09:00' }));
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
        await waitFor(() => expect(form.setFields).toHaveBeenCalledWith([{ name: 'reservationTime', value: undefined, errors: [] }]));
    });

    it('blocks prefilled form submission during lookup and failure, then permits a fresh available selection', async () => {
        const pending = deferred();
        api.get.mockReturnValueOnce(pending.promise).mockResolvedValueOnce([slot()]);
        let form;
        const onForm = value => { form = value; };
        const onFinish = vi.fn();
        render(<PanelHarness initialTime="10:00" onForm={onForm} onFinish={onFinish} />);
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
        let validation;
        await act(async () => { validation = await form.validateFields(['reservationTime']).catch(error => error); });
        expect(validation.errorFields[0].errors).toContain('예약 가능한 시간을 확인하는 중이에요. 잠시 후 다시 시도해 주세요.');
        expect(onFinish).not.toHaveBeenCalled();
        await act(async () => pending.reject(new Error('offline')));
        expect(await screen.findByRole('alert')).toBeInTheDocument();
        expect(form.getFieldValue('reservationTime')).toBeUndefined();
        await act(async () => { validation = await form.validateFields(['reservationTime']).catch(error => error); });
        expect(validation.errorFields[0].errors).toContain('예약 가능한 시간을 다시 불러와 주세요.');
        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        fireEvent.click(await screen.findByRole('button', { name: '10:00' }));
        await act(async () => { validation = await form.validateFields(['reservationTime']); });
        expect(validation.reservationTime).toBe('10:00');
    });

    it('retains required time validation after a successful lookup', async () => {
        api.get.mockResolvedValue([slot()]);
        let form;
        const onForm = value => { form = value; };
        render(<PanelHarness onForm={onForm} onFinish={vi.fn()} />);
        await screen.findByRole('button', { name: '10:00' });
        let validation;
        await act(async () => { validation = await form.validateFields(['reservationTime']).catch(error => error); });
        expect(validation.errorFields[0].errors).toContain('시간을 선택해주세요.');
    });

    it('auto-fills an available DAY slot without leaving a lookup validation error', async () => {
        api.get.mockResolvedValue([slot()]);
        let form;
        const onForm = value => { form = value; };
        render(<PanelHarness onForm={onForm} onFinish={vi.fn()} bookingType="DAY" />);
        expect(await screen.findByText('이 가게는 날짜만 선택하면 돼요')).toBeInTheDocument();
        await waitFor(() => expect(form.getFieldValue('reservationTime')).toBe('10:00'));
        await waitFor(() => expect(form.isFieldValidating('reservationTime')).toBe(false));
        expect(form.getFieldError('reservationTime')).toEqual([]);
        let values;
        await act(async () => { values = await form.validateFields(['reservationTime']); });
        expect(values.reservationTime).toBe('10:00');
    });

    it('preserves and submits the original edit time when its own reservation fills public capacity', async () => {
        api.get.mockResolvedValue([slot('10:00', false), slot('11:00', false)]);
        let form;
        const onForm = value => { form = value; };
        const onFinish = vi.fn();
        render(<PanelHarness initialTime="10:00" editingReservation={editingReservation} onForm={onForm} onFinish={onFinish} />);
        expect(await screen.findByRole('button', { name: '10:00' })).toBeEnabled();
        expect(screen.getByRole('button', { name: '11:00' })).toBeDisabled();
        expect(form.getFieldValue('reservationTime')).toBe('10:00');
        expect(screen.getByText(/기존 예약 시간이에요/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: '예약 변경하기' }));
        await waitFor(() => expect(onFinish).toHaveBeenCalledWith(expect.objectContaining({ reservationTime: '10:00', reservationDate: dateA })));
    });

    it.each([
        ['another date', { initialDate: dateB, editing: editingReservation }],
        ['another store', { initialDate: dateA, editing: { ...editingReservation, storeId: 99 } }],
        ['another original time', { initialDate: dateA, editing: { ...editingReservation, reservationTime: '09:00:00' } }],
    ])('does not grant the edit capacity exception for %s', async (_, context) => {
        api.get.mockResolvedValue([slot('10:00', false)]);
        let form;
        const onForm = value => { form = value; };
        render(<PanelHarness initialTime="10:00" initialDate={context.initialDate} editingReservation={context.editing} onForm={onForm} onFinish={vi.fn()} />);
        expect(await screen.findByRole('button', { name: '10:00' })).toBeDisabled();
        expect(form.getFieldValue('reservationTime')).toBeUndefined();
        let validation;
        await act(async () => {
            form.setFields([{ name: 'reservationTime', value: '10:00', errors: [] }]);
            validation = await form.validateFields(['reservationTime']).catch(error => error);
        });
        expect(validation.errorFields[0].errors).toContain('예약 가능한 시간을 다시 선택해주세요.');
    });

    it('rejects the original edit time when the server no longer returns that slot', async () => {
        api.get.mockResolvedValue([slot('11:00')]);
        let form;
        const onForm = value => { form = value; };
        render(<PanelHarness initialTime="10:00" editingReservation={editingReservation} onForm={onForm} onFinish={vi.fn()} />);
        await screen.findByRole('button', { name: '11:00' });
        expect(screen.queryByRole('button', { name: '10:00' })).not.toBeInTheDocument();
        expect(form.getFieldValue('reservationTime')).toBeUndefined();
        let validation;
        await act(async () => {
            form.setFields([{ name: 'reservationTime', value: '10:00', errors: [] }]);
            validation = await form.validateFields(['reservationTime']).catch(error => error);
        });
        expect(validation.errorFields[0].errors).toContain('예약 가능한 시간을 다시 선택해주세요.');
    });

    it('never grants the original edit exception while lookup is pending or failed', async () => {
        const pending = deferred();
        api.get.mockReturnValueOnce(pending.promise);
        let form;
        const onForm = value => { form = value; };
        render(<PanelHarness initialTime="10:00" editingReservation={editingReservation} onForm={onForm} onFinish={vi.fn()} />);
        await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
        let validation;
        await act(async () => { validation = await form.validateFields(['reservationTime']).catch(error => error); });
        expect(validation.errorFields[0].errors).toContain('예약 가능한 시간을 확인하는 중이에요. 잠시 후 다시 시도해 주세요.');
        await act(async () => {
            pending.reject(new Error('offline'));
            await pending.promise.catch(() => {});
        });
        expect(form.getFieldValue('reservationTime')).toBeUndefined();
        await act(async () => {
            form.setFields([{ name: 'reservationTime', value: '10:00', errors: [] }]);
            validation = await form.validateFields(['reservationTime']).catch(error => error);
        });
        expect(validation.errorFields[0].errors).toContain('예약 가능한 시간을 다시 불러와 주세요.');
    });

    it('retains a DAY edit original slot even when it fills public capacity', async () => {
        api.get.mockResolvedValue([slot('10:00', false)]);
        let form;
        const onForm = value => { form = value; };
        render(<PanelHarness initialTime="10:00" editingReservation={editingReservation} onForm={onForm} onFinish={vi.fn()} bookingType="DAY" />);
        expect(await screen.findByText('기존 예약 날짜를 선택했어요')).toBeInTheDocument();
        expect(form.getFieldValue('reservationTime')).toBe('10:00');
        let values;
        await act(async () => { values = await form.validateFields(['reservationTime']); });
        expect(values.reservationTime).toBe('10:00');
    });
});

describe('reservation edit lookup failure', () => {
    beforeEach(() => api.get.mockReset());

    function EditErrorHarness({ onRetry }) {
        const [form] = Form.useForm();
        return (
            <ReservationPanel store={store} form={form} onFinish={vi.fn()} isPC={false} isEditMode
                editingReservation={null} editLoadError={new Error('offline')} onRetryEditLoad={onRetry} />
        );
    }

    it('shows a retry in place of an unfilled edit form when the reservation lookup fails', () => {
        const onRetry = vi.fn();
        render(<EditErrorHarness onRetry={onRetry} />);

        expect(screen.getByRole('alert')).toHaveTextContent('변경할 예약 정보를 불러오지 못했습니다.');
        // 채워지지 않은 폼과 제출 버튼이 없어야 한다 — 누르면 새 예약처럼 보인다.
        expect(screen.queryByRole('button', { name: '예약 변경하기' })).not.toBeInTheDocument();
        expect(api.get).not.toHaveBeenCalled();

        fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }));
        expect(onRetry).toHaveBeenCalledOnce();
    });
});

describe('reservation date field schedule placement', () => {
    function SchedulePanelHarness() {
        const [form] = Form.useForm();
        return <ReservationPanel store={{ ...store, openDate: '2026-09-01', closeDate: '2026-12-31', closedDays: [6, 7], maxAdvanceBookingDays: 30 }} form={form} onFinish={vi.fn()} isPC={false} />;
    }

    it('leaves the date field free of operating-period and closure helper copy', () => {
        const { container } = render(<SchedulePanelHarness />);
        expect(screen.getByText('예약 날짜')).toBeInTheDocument();
        expect(container.querySelector('.ant-form-item-extra')).toBeNull();
        expect(screen.queryByText(/매주 토·일/)).toBeNull();
        expect(screen.queryByText(/2026-09-01/)).toBeNull();
        expect(screen.queryByText(/30일 이내/)).toBeNull();
    });
});
