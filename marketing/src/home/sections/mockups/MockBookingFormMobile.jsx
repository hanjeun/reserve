import { CalendarOutlined, ClockCircleOutlined, PlusOutlined, MinusOutlined } from '../../../../../frontend/src/components/common/icons';
import Button from '../../../../../frontend/src/components/common/Button';

export default function MockBookingFormMobile() {
    return <div className="marketing-booking-preview">
        <div className="marketing-demo-field"><span>예약 날짜</span><div>날짜 선택<CalendarOutlined /></div></div>
        <div className="marketing-demo-field"><span>예약 시간</span><div>시간 선택<ClockCircleOutlined /></div></div>
        <div className="marketing-demo-field"><span>인원 수</span><div>2명<span className="marketing-demo-quantity"><MinusOutlined /><PlusOutlined /></span></div></div>
        <div className="marketing-demo-field"><span>요청 사항</span><div className="marketing-demo-textarea">요청 사항을 입력해주세요.</div></div>
        <div className="marketing-demo-consent"><span />[필수] 예약·취소·환불 조건을 확인했어요.</div>
        <div className="marketing-demo-consent"><span />[필수] 가게에 예약 정보를 제공하는 데 동의해요.</div>
        <Button variant="primary" block>예약 신청하기</Button>
    </div>;
}
