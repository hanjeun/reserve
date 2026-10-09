import { Form, Switch } from 'antd';
import { FormInput, FormSelect } from '../../common';
import { BOOKING_DEADLINE_OPTIONS } from '../../../constants';
import { onboardingFieldRules, reservationApplies } from '../../../utils/storeOnboarding';
import InactiveReservationNotice from './InactiveReservationNotice';
import { usePolicyValues } from './questionValues';

export function BookingPolicyQuestion({ onEdit }) {
    const values = usePolicyValues();
    const enabled = reservationApplies(values);
    const unit = { SLOT: '한 시간대', SESSION: '한 회차', DAY: '하루' }[values.bookingType] || '한 시간대';
    return <>
        {!enabled && <InactiveReservationNotice onEdit={onEdit} />}
        <div hidden={!enabled}>
            <Form.Item label="최대 예약 인원" name="maxCapacityPerSlot" rules={onboardingFieldRules('maxCapacityPerSlot', values)}
                extra={`${unit}에 받는 인원 합계예요. 비워두면 제한 없이 받아요.`}>
                <FormInput type="number" min={1} max={999} precision={0} suffix="명" placeholder="제한 없음" />
            </Form.Item>
            <Form.Item label="예약 가능 기간" name="maxAdvanceBookingDays" rules={onboardingFieldRules('maxAdvanceBookingDays', values)}
                extra="오늘부터 며칠 뒤까지 받을지 정해요. 비워두면 제한이 없어요.">
                <FormInput type="number" min={1} max={365} precision={0} suffix="일" placeholder="제한 없음" />
            </Form.Item>
            <Form.Item label="예약 마감" name="bookingDeadlineHours" rules={onboardingFieldRules('bookingDeadlineHours', values)}>
                <FormSelect options={BOOKING_DEADLINE_OPTIONS} placeholder="제한 없음" />
            </Form.Item>
            <Form.Item label="예약 자동 승인" name="autoApprovalEnabled" valuePropName="checked" extra="끄면 사업자가 확인한 뒤 승인해요."><Switch /></Form.Item>
            <Form.Item label="중복 예약 허용" name="allowDuplicateReservation" valuePropName="checked" extra="끄면 한 손님은 같은 날 한 건만 예약할 수 있어요."><Switch /></Form.Item>
            <Form.Item label="예약 알림 메일" name="emailNotificationEnabled" valuePropName="checked"><Switch /></Form.Item>
        </div>
    </>;
}
