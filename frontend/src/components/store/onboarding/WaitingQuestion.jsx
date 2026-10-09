import { Form } from 'antd';
import IconChoicePicker from '../../common/IconChoicePicker';
import { WAITING_OFF, WAITING_OPTIONS } from './questionOptions';
export function WaitingQuestion({ mode = 'create' }) {
    return <>
        <Form.Item label="웨이팅 접수 방식" name="waitingIntakeMode">
            <IconChoicePicker label="웨이팅 접수 방식" options={mode === 'edit' ? [WAITING_OFF, ...WAITING_OPTIONS] : WAITING_OPTIONS} showDescription />
        </Form.Item>
        <p className="reserve-onboarding-help">사업자 패널의 웨이팅 탭에서 접수를 시작·중지하고 손님을 호출해요. 직원이 접수한 손님도 같은 명단에 표시돼요.</p>
    </>;
}
