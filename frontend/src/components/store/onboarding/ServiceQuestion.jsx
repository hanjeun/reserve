import { Form, Input } from 'antd';
import IconChoicePicker from '../../common/IconChoicePicker';
import { intakeService } from '../../../utils/storeOnboarding';
import { SERVICE_OPTIONS, PAUSED_SERVICE } from './questionOptions';
export function ServiceQuestion({ values, change, disabled, mode = 'create' }) {
    const select = service => change({ reservationEnabled: service !== 'waiting' && service !== 'paused',
        waitingIntakeMode: service === 'reservation' || service === 'paused' ? 'OFF'
            : values.waitingIntakeMode && values.waitingIntakeMode !== 'OFF' ? values.waitingIntakeMode : 'ONSITE' });
    const paused = mode === 'edit' && values.reservationEnabled === false && values.waitingIntakeMode === 'OFF';
    return <>
        <IconChoicePicker label="손님 접수 방식" value={paused ? 'paused' : intakeService(values)} onChange={select}
            options={mode === 'edit' ? [...SERVICE_OPTIONS, PAUSED_SERVICE] : SERVICE_OPTIONS} disabled={disabled} showDescription />
        <p className="reserve-onboarding-help">{mode === 'edit' ? '기존 예약·웨이팅 설정은 각 항목에서 계속 수정할 수 있어요.' : '운영 방식은 등록 후에도 바꿀 수 있어요.'}</p>
        <Form.Item name="reservationEnabled" hidden><Input /></Form.Item>
    </>;
}
