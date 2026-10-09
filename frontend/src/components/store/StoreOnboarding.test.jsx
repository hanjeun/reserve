import { useEffect } from 'react';
import { Form } from 'antd';
import dayjs from 'dayjs';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import StoreOnboarding from './StoreOnboarding';
import { buildStoreFormData } from '../../utils/form';
import { requestRegistrationStepBack } from '../../utils/storeRegistrationNavigation';

vi.mock('../../hooks', () => ({ useWindowWidth: () => 1100 }));
vi.mock('./StoreDetailPreview', () => ({ default: ({ store, infoContent, device }) => <section aria-label="가게 상세 미리보기" data-device={device}>
    <p>상세 미리보기: {store.name}</p>{infoContent}
</section> }));
vi.mock('./StoreForm/AddressSearch', () => ({ default: ({ id, value, onChange }) => <input id={id} value={value || ''} onChange={onChange} /> }));
vi.mock('./StoreForm/StoreImages', () => {
    const ValueInput = ({ value = '', onChange }) => <input aria-label="대표 이미지 검증 값" value={value} onChange={onChange} />;
    return { default: ({ mainImageRequired }) => <Form.Item name="mainImage" rules={mainImageRequired ? [{ required: true, message: '대표 이미지를 등록해주세요' }] : []}><ValueInput /></Form.Item> };
});
const submit = vi.fn();
const draft = vi.fn();
const changes = vi.fn();
const complete = {
    serviceDomain: 'FOOD', category: '한식', name: '예약 가게', address: '서울특별시 강남구 테헤란로 1', phone: '02-1234-5678',
    times: [dayjs('2026-10-08T09:00:00'), dayjs('2026-10-08T18:00:00')], mainImage: 'uploaded',
};
function Harness({ restored, mode = 'create', initialValues }) {
    const [form] = Form.useForm();
    useEffect(() => { if (restored) form.setFieldsValue(restored); }, [form, restored]);
    return <StoreOnboarding mode={mode} form={form} initialValues={initialValues} onSubmit={submit} onSaveDraft={draft} onValuesChange={changes} />;
}
beforeEach(() => { submit.mockReset(); draft.mockReset(); changes.mockReset(); });

it('validates one question at a time, skips booking for waiting-only and never submits an intermediate step', async () => {
    render(<Harness />);
    const next = screen.getByRole('button', { name: '다음' });
    fireEvent.click(next);
    await screen.findByText('서비스 분야를 선택해주세요.');
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '맛집 · 카페' }));
    await waitFor(() => expect(screen.getByLabelText('업종')).toHaveValue('맛집 · 카페'));
    fireEvent.click(next);
    await screen.findByRole('heading', { name: '손님을 어떻게 받고 싶으세요?' });
    fireEvent.click(screen.getByRole('button', { name: '웨이팅' }));
    fireEvent.click(next);
    await screen.findByRole('heading', { name: '웨이팅은 어디에서 접수할까요?' });
    expect(screen.queryByRole('heading', { name: '손님이 무엇을 선택하면 되나요?' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '임시저장' }));
    expect(draft).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
});

it('restores the saved step and submits only the final registered values, without charging a waiting-only deposit', async () => {
    render(<Harness restored={{ ...complete, _onboardingStep: 'review', reservationEnabled: false, waitingIntakeMode: 'BOTH', noShowDeposit: 10000 }} />);
    await screen.findByRole('heading', { name: '손님에게 이렇게 보여요.' });
    await screen.findByText('상세 미리보기: 예약 가게');
    fireEvent.click(screen.getByRole('button', { name: '등록 완료' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const data = buildStoreFormData(submit.mock.calls[0][0]);
    expect(data.get('reservationEnabled')).toBe('false');
    expect(data.get('waitingIntakeMode')).toBe('BOTH');
    expect(data.get('noShowDeposit')).toBe('0');
    expect(data.get('_onboardingStep')).toBeNull();
    expect(data.get('name')).toBe('예약 가게');
});

it('entering the preview and implicit form submission cannot create a store', async () => {
    render(<Harness restored={{ ...complete, _onboardingStep: 'identity' }} />);
    await screen.findByRole('heading', { name: '손님에게 가게를 소개해주세요.' });
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await screen.findByText('상세 미리보기: 예약 가게');
    const confirm = screen.getByRole('button', { name: '등록 완료' });
    await act(async () => { fireEvent.submit(confirm.closest('form')); });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
});

it('keeps one registration request in flight even when the final action is clicked repeatedly', async () => {
    let completeRequest;
    const pending = new Promise(resolve => { completeRequest = resolve; });
    submit.mockImplementationOnce(() => pending);
    render(<Harness restored={{ ...complete, _onboardingStep: 'review' }} />);
    await screen.findByText('상세 미리보기: 예약 가게');
    const confirm = screen.getByRole('button', { name: '등록 완료' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    fireEvent.click(confirm);
    expect(submit).toHaveBeenCalledTimes(1);
    await act(async () => { completeRequest(); await pending; });
});

it('keeps restored values when moving back and directs final validation to the question that needs correction', async () => {
    render(<Harness restored={{ ...complete, phone: '', _onboardingStep: 'review' }} />);
    await screen.findByRole('heading', { name: '손님에게 이렇게 보여요.' });
    fireEvent.click(screen.getByRole('button', { name: '등록 완료' }));
    await screen.findByRole('heading', { name: '손님에게 가게를 소개해주세요.' });
    expect(screen.getByLabelText('가게 이름')).toHaveValue('예약 가게');
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('연락처'), { target: { value: '02-5555-5555' } });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await screen.findByRole('heading', { name: '손님에게 이렇게 보여요.' });
    fireEvent.click(screen.getByRole('button', { name: '연락처 수정' }));
    await screen.findByRole('heading', { name: '손님에게 가게를 소개해주세요.' });
    expect(screen.getByLabelText('연락처')).toHaveValue('02-5555-5555');
});

it('edits empty and inactive fields inside the preview and returns with the changed values and selected device', async () => {
    render(<Harness restored={{ ...complete, phone: '', _onboardingStep: 'review', _onboardingPreviewDevice: 'pc' }} />);
    const preview = await screen.findByRole('region', { name: '가게 상세 미리보기' });
    const editContact = within(preview).getByRole('button', { name: '연락처 수정' });
    expect(editContact.parentElement).toHaveTextContent('작성 안 됨');
    const editWaiting = within(preview).getByRole('button', { name: '웨이팅 수정' });
    expect(editWaiting.parentElement).toHaveTextContent('사용 안 함');
    expect(within(preview).getByRole('button', { name: '임시 휴무일 수정' }).parentElement).toHaveTextContent('없음');
    fireEvent.click(editWaiting);
    await screen.findByRole('heading', { name: '손님을 어떻게 받고 싶으세요?' });
    act(() => { expect(requestRegistrationStepBack()).toBe(true); });
    const returned = await screen.findByRole('region', { name: '가게 상세 미리보기' });
    fireEvent.click(within(returned).getByRole('button', { name: '연락처 수정' }));
    await screen.findByRole('heading', { name: '손님에게 가게를 소개해주세요.' });
    fireEvent.change(screen.getByLabelText('연락처'), { target: { value: '02-5555-5555' } });
    act(() => { expect(requestRegistrationStepBack()).toBe(true); });
    const updated = await screen.findByRole('region', { name: '가게 상세 미리보기' });
    expect(within(updated).getByText('02-5555-5555')).toBeInTheDocument();
    expect(updated).toHaveAttribute('data-device', 'pc');
    expect(submit).not.toHaveBeenCalled();
});

it('starts editing with the stored values and returns from a selected question without saving the store', async () => {
    render(<Harness mode="edit" initialValues={{ ...complete, bookingDeadlineHours: 0 }} />);
    await screen.findByRole('heading', { name: '무엇을 수정하시겠어요?' });
    expect(screen.queryByRole('button', { name: '수정 완료' })).toBeNull();
    expect(changes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '소개·사진' }));
    await screen.findByRole('heading', { name: '손님에게 가게를 소개해주세요.' });
    expect(screen.getByLabelText('가게 이름')).toHaveValue('예약 가게');
    fireEvent.change(screen.getByLabelText('연락처'), { target: { value: '02-5555-5555' } });
    act(() => { expect(requestRegistrationStepBack()).toBe(true); });
    await screen.findByRole('heading', { name: '무엇을 수정하시겠어요?' });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    const preview = await screen.findByRole('region', { name: '가게 상세 미리보기' });
    expect(within(preview).getByText('02-5555-5555')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '등록할 내용' })).toBeNull();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(within(preview).getByRole('button', { name: '연락처 수정' }));
    await screen.findByRole('heading', { name: '손님에게 가게를 소개해주세요.' });
    act(() => { expect(requestRegistrationStepBack()).toBe(true); });
    await screen.findByRole('region', { name: '가게 상세 미리보기' });
    act(() => { expect(requestRegistrationStepBack()).toBe(true); });
    await screen.findByRole('heading', { name: '무엇을 수정하시겠어요?' });
    act(() => { expect(requestRegistrationStepBack()).toBe(false); });
    expect(submit).not.toHaveBeenCalled();
});

it('preserves inactive editing settings and optional photos and only submits after explicit final confirmation', async () => {
    render(<Harness mode="edit" initialValues={{ ...complete, mainImage: undefined, bookingDeadlineHours: 0,
        reservationEnabled: false, waitingIntakeMode: 'OFF', noShowDeposit: 10000, nearbyRadiusKm: 0 }} />);
    await screen.findByRole('heading', { name: '무엇을 수정하시겠어요?' });
    fireEvent.click(screen.getByRole('button', { name: '접수 방식' }));
    await screen.findByRole('heading', { name: '손님을 어떻게 받고 싶으세요?' });
    expect(screen.getByRole('button', { name: '접수 중지' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await screen.findByRole('region', { name: '가게 상세 미리보기' });
    const confirm = screen.getByRole('button', { name: '수정 완료' });
    await act(async () => { fireEvent.submit(confirm.closest('form')); });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    const data = buildStoreFormData(submit.mock.calls[0][0]);
    expect(data.get('reservationEnabled')).toBe('false');
    expect(data.get('waitingIntakeMode')).toBe('OFF');
    expect(data.get('noShowDeposit')).toBe('10000');
    expect(data.get('nearbyRadiusKm')).toBe('0');
    expect(data.get('_onboardingStep')).toBeNull();
});

it('keeps final edit validation and returns to the preview after correcting a field', async () => {
    render(<Harness mode="edit" initialValues={{ ...complete, phone: '', bookingDeadlineHours: 0 }} />);
    await screen.findByRole('heading', { name: '무엇을 수정하시겠어요?' });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await screen.findByRole('region', { name: '가게 상세 미리보기' });
    fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    await screen.findByRole('heading', { name: '손님에게 가게를 소개해주세요.' });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('연락처'), { target: { value: '02-5555-5555' } });
    fireEvent.click(screen.getByRole('button', { name: '미리보기' }));
    await screen.findByRole('region', { name: '가게 상세 미리보기' });
    fireEvent.click(screen.getByRole('button', { name: '수정 완료' }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0].phone).toBe('02-5555-5555');
});
