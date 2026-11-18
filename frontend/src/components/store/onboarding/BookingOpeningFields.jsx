import { Form } from 'antd';
import { FormDatePicker, FormSelect, FormTimePicker } from '../../common';
import { onboardingFieldRules } from '../../../utils/storeOnboarding';

const OPTIONS = [{ value: 'IMMEDIATE', label: '즉시' }, { value: 'SCHEDULED', label: '지정 시각' }];

export default function BookingOpeningFields() {
    const form = Form.useFormInstance();
    const bookingOpeningMode = Form.useWatch('bookingOpeningMode', { form, preserve: true }) ?? 'IMMEDIATE';
    const values = { bookingOpeningMode };
    return <>
        <Form.Item label="예약 오픈" name="bookingOpeningMode">
            <FormSelect options={OPTIONS} />
        </Form.Item>
        {bookingOpeningMode === 'SCHEDULED' && <>
            <Form.Item label="오픈 날짜" name="bookingOpeningDate" rules={onboardingFieldRules('bookingOpeningDate', values)}>
                <FormDatePicker />
            </Form.Item>
            <Form.Item label="오픈 시각" name="bookingOpeningTime" extra="한국 시간 기준이에요."
                rules={onboardingFieldRules('bookingOpeningTime', values)}>
                <FormTimePicker format="HH:mm" />
            </Form.Item>
            <Form.Item label="적용할 방문일" name="bookingOpeningPeriod" dependencies={['bookingOpeningDate']}
                rules={onboardingFieldRules('bookingOpeningPeriod', values)}>
                <FormDatePicker.RangePicker />
            </Form.Item>
        </>}
    </>;
}
