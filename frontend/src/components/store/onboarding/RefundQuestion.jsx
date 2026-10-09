import { Form } from 'antd';
import { Button, FormSelect } from '../../common';
import { FULL_REFUND_DAYS_OPTIONS, PARTIAL_REFUND_DAYS_OPTIONS, PARTIAL_REFUND_RATE_OPTIONS } from '../../../constants';
import { depositApplies, onboardingFieldRules, reservationApplies } from '../../../utils/storeOnboarding';
import { usePolicyValues } from './questionValues';
import InactiveReservationNotice from './InactiveReservationNotice';

export function RefundQuestion({ onEdit, change }) {
    const values = usePolicyValues();
    const paid = depositApplies(values);
    const full = Number(values.fullRefundDays);
    const partialOptions = PARTIAL_REFUND_DAYS_OPTIONS.filter(option => !full || !option.value || option.value < full);
    const selectFullRefund = next => {
        if (next > 0 && Number(values.partialRefundDays) >= next) change({ partialRefundDays: 0 });
    };
    return <>
        {!reservationApplies(values) ? <InactiveReservationNotice onEdit={onEdit} />
            : !paid && <p className="reserve-onboarding-help">예약금이 없어 환불 정책을 적용하지 않아요.{' '}
                <Button variant="ghost-sm" size="sm" htmlType="button" onClick={() => onEdit('deposit')}>예약금 설정</Button></p>}
        <div hidden={!paid}>
            <p className="reserve-onboarding-help">환불 기준을 정해주세요. 남아 있는 유료 예약이 있으면 기존 조건을 보호하기 위해 기준 변경을 제한해요.</p>
            <Form.Item label="전액 환불 기준" name="fullRefundDays" rules={onboardingFieldRules('fullRefundDays', values)}>
                <FormSelect options={FULL_REFUND_DAYS_OPTIONS} onChange={selectFullRefund} />
            </Form.Item>
            {full === 0 && <p className="reserve-onboarding-help">환불 없음을 선택하면 부분 환불도 적용하지 않아요.</p>}
            <Form.Item label="부분 환불 기준" name="partialRefundDays" hidden={full === 0} dependencies={['fullRefundDays']}
                rules={onboardingFieldRules('partialRefundDays', values)} extra={full > 0 ? '전액 환불 기준보다 방문일에 가까운 날을 선택해주세요.' : undefined}>
                <FormSelect options={partialOptions} />
            </Form.Item>
            <Form.Item label="부분 환불율" name="partialRefundRate" hidden={full === 0 || !Number(values.partialRefundDays)}
                rules={onboardingFieldRules('partialRefundRate', values)}>
                <FormSelect options={PARTIAL_REFUND_RATE_OPTIONS} />
            </Form.Item>
        </div>
    </>;
}
