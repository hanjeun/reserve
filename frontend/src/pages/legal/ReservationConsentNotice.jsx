import PropTypes from 'prop-types';
import { Typography } from 'antd';
import DetailInfoRows from '../../components/common/DetailInfoRows';
import { ShopOutlined, SafetyCertificateOutlined, ClockCircleOutlined, FileTextOutlined, PhoneOutlined, EnvironmentOutlined } from '../../components/common/icons';

export default function ReservationConsentNotice({ details }) {
    return <div className="reserve-reservation-consent-notice">
        <DetailInfoRows rows={[
            { Icon: ShopOutlined, label: '제공받는 자', value: details.recipient },
            { Icon: SafetyCertificateOutlined, label: '이용 목적', value: details.purpose },
            { Icon: FileTextOutlined, label: '제공 항목', value: details.items.join(' · ') },
            { Icon: ClockCircleOutlined, label: '보유기간', value: details.retention },
            { Icon: EnvironmentOutlined, label: '가게 주소', value: details.sellerAddress || '가게 안내를 확인해주세요.' },
            { Icon: PhoneOutlined, label: '가게 연락처', value: details.sellerPhone || '가게 문의를 이용해주세요.' },
        ]} />
        <Typography.Paragraph>{details.refusal}</Typography.Paragraph>
        <Typography.Paragraph>예약금: {Number(details.depositAmount).toLocaleString('ko-KR')}원</Typography.Paragraph>
        <Typography.Paragraph>방문 {details.fullRefundDays}일 전까지 전액 환불, 방문 {details.partialRefundDays}일 전까지 {details.partialRefundRate}% 환불 조건입니다. 관련 법령에서 보장하는 권리가 우선합니다.</Typography.Paragraph>
        {details.attendanceRefundEnabled && <Typography.Paragraph>QR 체크인과 이용 완료가 확인되면 보증금 전액의 환불을 요청합니다.</Typography.Paragraph>}
    </div>;
}
ReservationConsentNotice.propTypes = { details: PropTypes.object.isRequired };
