import { Form, Input } from 'antd';
import { FormInput, FormSelect, SegmentedControl } from '../../common';
import { PAYMENT_TIMEOUT_OPTIONS } from '../../../constants';
import { depositApplies, depositSelected, onboardingFieldRules, reservationApplies } from '../../../utils/storeOnboarding';
import InactiveReservationNotice from './InactiveReservationNotice';
import { usePolicyValues } from './questionValues';

const DEPOSIT_OPTIONS = [{ value: 0, label: '예약금 없이 받기' }, { value: 1, label: '예약금 설정하기' }];
const PAYMENT_OPTIONS = [{ value: 0, label: '신청할 때 결제' }, { value: 1, label: '나중 결제도 허용' }];
export function DepositQuestion({ change, onEdit }) {
    const values = usePolicyValues();
    const enabled = reservationApplies(values);
    const paid = depositApplies(values);
    const selectDeposit = selected => change({ _depositEnabled: selected === 1,
        ...(selected && !Number(values.noShowDeposit) ? { noShowDeposit: undefined } : {}) });
    return <>
        {!enabled && <InactiveReservationNotice onEdit={onEdit} />}
        <div hidden={!enabled}>
            <Form.Item label="예약금을 받을까요?">
                <SegmentedControl options={DEPOSIT_OPTIONS} value={Number(depositSelected(values))} onChange={selectDeposit} />
            </Form.Item>
            <Form.Item name="_depositEnabled" hidden><Input /></Form.Item>
            {!paid && <p className="reserve-onboarding-help">예약금 없이 예약을 받아요. 결제와 환불 정책을 입력하지 않아도 돼요.</p>}
            <div hidden={!paid}>
                <Form.Item label="노쇼 예약금" name="noShowDeposit" rules={onboardingFieldRules('noShowDeposit', values)}
                    extra="방문 예약에 필요한 금액을 정해주세요.">
                    <FormInput type="number" min={1} max={100000} precision={0} step={1000} suffix="원" placeholder="예약금 입력"
                        formatter={value => value == null || value === '' ? '' : String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                        parser={value => value?.replaceAll(',', '')} />
                </Form.Item>
                <Form.Item label="언제 결제할 수 있나요?" name="allowLatePayment"
                    getValueProps={value => ({ value: Number(Boolean(value)) })} getValueFromEvent={value => value === 1}>
                    <SegmentedControl options={PAYMENT_OPTIONS} />
                </Form.Item>
                <p className="reserve-onboarding-help">{values.allowLatePayment
                    ? '먼저 예약을 신청하고 내 예약에서 결제할 수 있어요. 정해진 시간까지 결제하지 않으면 자동 취소돼요.'
                    : '예약을 신청하면서 예약금을 결제해요. 결제를 마친 뒤 신청 결과를 확인해주세요.'}</p>
                <Form.Item label="결제 마감" name="paymentTimeoutMinutes" hidden={!values.allowLatePayment}
                    rules={onboardingFieldRules('paymentTimeoutMinutes', values)} extra="나중 결제를 선택한 손님이 예약 신청 후 결제할 수 있는 시간이에요.">
                    <FormSelect options={PAYMENT_TIMEOUT_OPTIONS} />
                </Form.Item>
            </div>
        </div>
    </>;
}
