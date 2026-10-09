import { Button } from '../../common';

export default function InactiveReservationNotice({ onEdit }) {
    return <p className="reserve-onboarding-help">현재 예약 접수가 꺼져 있어요. 기존 예약 설정은 유지해요.{' '}
        <Button variant="ghost-sm" size="sm" htmlType="button" onClick={() => onEdit('service')}>접수 방식 수정</Button>
    </p>;
}
