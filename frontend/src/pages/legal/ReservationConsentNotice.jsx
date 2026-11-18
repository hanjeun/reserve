import PropTypes from 'prop-types';
import { Typography } from 'antd';

export default function ReservationConsentNotice({ details, section }) {
    return <div className="reserve-reservation-consent-notice">
        {section !== 'conditions' && <><ul style={{ paddingLeft: 20 }}>
            {[
                ['제공받는 자', details.recipient],
                ['이용 목적', details.purpose],
                ['제공 항목', details.items.join(' · ')],
                ['보유기간', details.retention],
                ['가게 주소', details.sellerAddress || '가게 안내를 확인해주세요.'],
                ['가게 연락처', details.sellerPhone || '가게 문의를 이용해주세요.'],
            ].map(([label, value]) => <li key={label} style={{ marginBottom: 6 }}><strong>{label}:</strong> {value}</li>)}
        </ul>
        <Typography.Paragraph>{details.refusal}</Typography.Paragraph></>}
        {section !== 'sharing' && <><Typography.Paragraph>예약금: {Number(details.depositAmount).toLocaleString('ko-KR')}원</Typography.Paragraph>
        <Typography.Paragraph>방문 {details.fullRefundDays}일 전까지 전액 환불, 방문 {details.partialRefundDays}일 전까지 {details.partialRefundRate}% 환불 조건입니다. 관련 법령에서 보장하는 권리가 우선합니다.</Typography.Paragraph>
        {details.attendanceRefundEnabled && <Typography.Paragraph>QR 체크인과 이용 완료가 확인되면 보증금 전액의 환불을 요청합니다.</Typography.Paragraph>}</>}
    </div>;
}
ReservationConsentNotice.propTypes = { details: PropTypes.object.isRequired, section: PropTypes.oneOf(['conditions', 'sharing']) };
