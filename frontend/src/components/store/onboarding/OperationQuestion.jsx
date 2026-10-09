import dayjs from 'dayjs';
import { Checkbox, Form } from 'antd';
import { FormDatePicker, FormSelect, FormTimePicker } from '../../common';
import { NEARBY_RADIUS_OPTIONS } from '../../../constants';
import { onboardingFieldRules, reservationApplies } from '../../../utils/storeOnboarding';
import { usePolicyValues } from './questionValues';

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'];
export function OperationQuestion({ mode = 'create' }) {
    const values = usePolicyValues();
    const slot = reservationApplies(values) && values.bookingType === 'SLOT';
    return <>
        <Form.Item label="영업 시간" name="times" rules={onboardingFieldRules('times', values)}
            extra={values.bookingType === 'SESSION' && reservationApplies(values) ? '가게 정보에 보여주는 시간이에요. 예약은 회차 시각으로 받아요.' : undefined}>
            <FormTimePicker.RangePicker placeholder={['시작 시간', '종료 시간']} />
        </Form.Item>
        <Form.Item label="브레이크 타임" name="breakTimes" hidden={!slot}
            dependencies={['times']} rules={onboardingFieldRules('breakTimes', values)}>
            <FormTimePicker.RangePicker placeholder={['시작 시간', '종료 시간']} />
        </Form.Item>
        <Form.Item label="정기 휴무" name="closedDays" extra="선택하지 않으면 매일 운영해요.">
            <Checkbox.Group className="reserve-weekday-group" options={WEEKDAYS.map((label, index) => ({ label, value: index + 1 }))} />
        </Form.Item>
        <Form.Item label="운영 기간" name="operatingPeriod" extra="기간이 정해진 가게만 선택해주세요. 비워두면 계속 운영해요.">
            <FormDatePicker.RangePicker allowEmpty={[true, true]} highlightHolidays />
        </Form.Item>
        <Form.Item label="임시 휴무일" name="closedDates">
            <FormDatePicker multiple highlightHolidays disabledDate={mode === 'edit' ? value => value?.isBefore(dayjs().startOf('day')) : undefined} />
        </Form.Item>
        <Form.Item label="우리동네 배지 기준" name="nearbyRadiusKm" rules={onboardingFieldRules('nearbyRadiusKm', values)}
            extra="0이면 우리동네 배지를 표시하지 않아요.">
            <FormSelect options={NEARBY_RADIUS_OPTIONS} />
        </Form.Item>
    </>;
}
