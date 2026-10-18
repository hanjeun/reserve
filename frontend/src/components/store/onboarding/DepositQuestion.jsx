import { Form, Input } from 'antd';
import { FormInput, FormSelect, SegmentedControl } from '../../common';
import { PAYMENT_TIMEOUT_OPTIONS } from '../../../constants';
import { depositApplies, depositSelected, onboardingFieldRules, paymentTimeoutApplies, reservationApplies } from '../../../utils/storeOnboarding';
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
                    ? '먼저 예약을 신청하고 내 예약에서 결제할 수 있어요. 미결제만을 이유로 자동 취소하지 않아요.'
                    : '예약 신청 후 바로 예약금을 결제해주세요. 결제 시간 제한이 있으면 제한 시간이 지난 미결제 대기 예약은 자동 취소돼요.'}</p>
                <Form.Item label="결제 마감" name="paymentTimeoutMinutes" hidden={!paymentTimeoutApplies(values)}
                    rules={onboardingFieldRules('paymentTimeoutMinutes', values)} extra="신청할 때 결제하는 예약의 결제 대기 시간이에요. 제한 없음을 선택하면 미결제로 자동 취소하지 않아요.">
                    <FormSelect options={PAYMENT_TIMEOUT_OPTIONS} />
                </Form.Item>
            </div>
        </div>
    </>;
}
