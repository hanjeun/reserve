import React from 'react';
import { Typography, Flex, Divider } from 'antd';
import {
    UserOutlined, CalendarOutlined, ClockCircleOutlined, TeamOutlined, MailOutlined, DollarOutlined,
    CheckCircleOutlined,
} from '../common/icons';
import ReservationStatusBadge from './ReservationStatusBadge';
import CopyableText from '../common/CopyableText';
import ResponsiveModal from '../common/ResponsiveModal';
import { formatTime, formatCurrency } from '../../utils';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/*
 * 손님·사업자가 같은 읽기 전용 예약 상세를 사용하며 실행 도구는 각 화면이 담당한다.
 */
const ReservationDetailModal = ({ reservation, open, onClose, tools }) => {
    // 닫힘 중에도 마지막 예약 내용을 유지해 모달이 일찍 사라지지 않게 한다.

    const [cached, setCached] = React.useState(reservation);
    if (reservation && reservation !== cached) setCached(reservation);

    const displayed = reservation ?? cached;
    if (!displayed) return null;

    const {
        storeName, reservationCode, memberName, memberEmail, reservationDate, reservationTime,
        guestCount, depositAmount, status, specialRequest, rejectionReason, cancelReason, checkedInAt, personalInfoHidden,
    } = displayed;

    // 거절·취소는 각각의 사유 필드와 라벨을 사용한다.

    let reasonBlock = null;
    if (status === 'REJECTED' && rejectionReason) reasonBlock = { label: '거절 사유', value: rejectionReason };
    else if (status === 'CANCELLED' && cancelReason) reasonBlock = { label: '취소 사유', value: cancelReason };

    return (
        <ResponsiveModal title="예약 상세" open={open} onCancel={onClose} footer={null} centered mobileSize="content">
            <Flex align="center" justify="space-between" style={{ marginBottom: 4 }}>
                <Text strong style={{ fontSize: fontSize.lg }}>{storeName}</Text>
                <ReservationStatusBadge status={status} />
            </Flex>
            {reservationCode && (
                <CopyableText
                    value={reservationCode}
                    label="예약번호"
                    style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}
                />
            )}
            <Divider style={{ margin: '12px 0' }} />
            <div style={styles.detailRow}>
                <UserOutlined style={styles.detailIcon} />
                <Text style={styles.detailLabel}>예약자</Text>
                <Text style={styles.detailValue}>{personalInfoHidden ? '개인정보 조회 기간이 지났어요' : memberName}</Text>
            </div>
            {memberEmail && (
                <div style={styles.detailRow}>
                    <MailOutlined style={styles.detailIcon} />
                    <Text style={styles.detailLabel}>이메일</Text>
                    <CopyableText value={memberEmail} label="이메일" style={styles.detailValue} />
                </div>
            )}
            <div style={styles.detailRow}>
                <CalendarOutlined style={styles.detailIcon} />
                <Text style={styles.detailLabel}>날짜</Text>
                <Text style={styles.detailValue}>{reservationDate}</Text>
            </div>
            <div style={styles.detailRow}>
                <ClockCircleOutlined style={styles.detailIcon} />
                <Text style={styles.detailLabel}>시간</Text>
                <Text style={styles.detailValue}>{formatTime(reservationTime)}</Text>
            </div>
            <div style={styles.detailRow}>
                <TeamOutlined style={styles.detailIcon} />
                <Text style={styles.detailLabel}>인원</Text>
                <Text style={styles.detailValue}>{guestCount}명</Text>
            </div>
            <div style={styles.detailRow}>
                <DollarOutlined style={styles.detailIcon} />
                <Text style={styles.detailLabel}>금액</Text>
                <Text style={styles.detailValue} strong>{formatCurrency(depositAmount)}</Text>
            </div>
            {checkedInAt && (
                <div style={styles.detailRow}>
                    <CheckCircleOutlined style={{ ...styles.detailIcon, color: colors.success.main }} />
                    <Text style={styles.detailLabel}>체크인</Text>
                    <Text style={styles.detailValue}>
                        {checkedInAt.substring(0, 16).replace('T', ' ')}
                    </Text>
                </div>
            )}
            {specialRequest && (
                <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text style={{ ...styles.detailLabel, display: 'block', marginBottom: 6 }}>요청 사항</Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary, whiteSpace: 'pre-wrap' }}>
                        {specialRequest}
                    </Text>
                </>
            )}
            {reasonBlock && (
                <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text style={{ ...styles.detailLabel, display: 'block', marginBottom: 6 }}>{reasonBlock.label}</Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.error.main }}>{reasonBlock.value}</Text>
                </>
            )}
            {typeof tools === 'function' ? tools(displayed, open) : tools}
        </ResponsiveModal>
    );
};

const styles = {
    detailRow:   { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' },
    detailIcon:  { fontSize: 13, color: colors.text.tertiary, width: 16 },
    // whiteSpace: nowrap 필수 — 고정 폭(50px)이라 폭이 모자라면 "예약자"가 글자 단위로 접힌다.
    detailLabel: { fontSize: fontSize.sm, color: colors.text.tertiary, width: 50, flexShrink: 0, whiteSpace: 'nowrap' },
    detailValue: { fontSize: fontSize.sm, color: colors.text.primary },
};

export default ReservationDetailModal;
