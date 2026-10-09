import { Form } from 'antd';
import { FormSelect, FormTimePicker } from '../../common';
import IconChoicePicker from '../../common/IconChoicePicker';
import { RESERVATION_SLOT_OPTIONS } from '../../../constants';
import { BOOKING_OPTIONS } from './questionOptions';
import { onboardingFieldRules, reservationApplies } from '../../../utils/storeOnboarding';
import InactiveReservationNotice from './InactiveReservationNotice';
import { useQuestionValues } from './questionValues';
const bookingValues = values => ({reservationEnabled:values.reservationEnabled, bookingType:values.bookingType});
export function BookingQuestion({ onEdit }) {
    const values = useQuestionValues(bookingValues);
    const enabled = reservationApplies(values);
    return <>
        {!enabled && <InactiveReservationNotice onEdit={onEdit} />}
        <div hidden={!enabled}>
        <Form.Item name="bookingType" label="예약 방식">
            <IconChoicePicker label="예약 방식" options={BOOKING_OPTIONS} showDescription />
        </Form.Item>
        <Form.Item label="시간 선택 간격" name="reservationSlotMinutes"
            hidden={!enabled || values.bookingType !== 'SLOT'}
            rules={onboardingFieldRules('reservationSlotMinutes', values)}>
            <FormSelect options={RESERVATION_SLOT_OPTIONS} />
        </Form.Item>
        <Form.Item label="회차 시각" name="sessionTimes" hidden={!enabled || values.bookingType !== 'SESSION'}
            rules={onboardingFieldRules('sessionTimes', values)}
            extra="손님은 여기에 등록한 회차 중에서 선택해요.">
            <FormTimePicker multiple placeholder="회차 시각 선택" />
        </Form.Item>
        </div>
    </>;
}
