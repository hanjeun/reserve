import React from 'react';
import { Modal, Typography, Flex, Divider } from 'antd';
import {
    UserOutlined, CalendarOutlined, ClockCircleOutlined, TeamOutlined, MailOutlined, DollarOutlined,
} from '@ant-design/icons';
import ReservationStatusBadge from './ReservationStatusBadge';
import { formatTime, formatCurrency } from '../../utils';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 예약 상세 모달 — 읽기 전용 정보 표시만 담당 (액션 버튼은 각 화면에서 별도 렌더링).
 * 사업자 패널(ReservationCard)과 내 예약(MyReservations) 양쪽에서 공용으로 사용해서
 * 두 화면의 예약 상세 정보 표시 방식(항목 구성, 아이콘, 스타일)을 하나로 통일한다.
 */
const ReservationDetailModal = ({ reservation, open, onClose }) => {
    // 2026-07 버그 수정: reservation이 null이 되는 순간(부모가 닫을 때 detailReservation을 null로
    // 설정하는 화면 — MyReservations.jsx) `if (!reservation) return null`이 Modal 자체를
    // 렌더링에서 빼버려서, AntD가 닫힘 애니메이션을 재생할 DOM이 통째로 사라졌었다
    // (useImagePreview의 예전 버그, SanctionModal의 예전 key-toggle 버그와 같은 부류). 마지막으로 받은
    // 유효한 reservation을 캐시해두고 그걸로 렌더링해서, reservation이 null이 되어도 Modal은
    // open=false로만 전환되고 내용은 애니메이션이 끝날 때까지 그대로 남아있게 한다.
    const [cached, setCached] = React.useState(reservation);
    React.useEffect(() => {
        if (reservation) setCached(reservation);
    }, [reservation]);

    if (!cached) return null;

    const {
        storeName, reservationCode, memberName, memberEmail, reservationDate, reservationTime,
        guestCount, depositAmount, status, specialRequest, rejectionReason,
    } = cached;

    return (
        <Modal title="예약 상세" open={open} onCancel={onClose} footer={null} centered>
            <Flex align="center" justify="space-between" style={{ marginBottom: 4 }}>
                <Text strong style={{ fontSize: fontSize.lg }}>{storeName}</Text>
                <ReservationStatusBadge status={status} />
            </Flex>
            {reservationCode && (
                <Text
                    copyable={{ text: reservationCode }}
                    style={{ fontSize: fontSize.xs, color: colors.text.tertiary }}
                >
                    {reservationCode}
                </Text>
            )}
            <Divider style={{ margin: '12px 0' }} />
            <div style={styles.detailRow}>
                <UserOutlined style={styles.detailIcon} />
                <Text style={styles.detailLabel}>예약자</Text>
                <Text style={styles.detailValue}>{memberName}</Text>
            </div>
            {memberEmail && (
                <div style={styles.detailRow}>
                    <MailOutlined style={styles.detailIcon} />
                    <Text style={styles.detailLabel}>이메일</Text>
                    <Text style={styles.detailValue} copyable={{ text: memberEmail }}>{memberEmail}</Text>
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
            {specialRequest && (
                <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text style={{ ...styles.detailLabel, display: 'block', marginBottom: 6 }}>요청 사항</Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary, whiteSpace: 'pre-wrap' }}>
                        {specialRequest}
                    </Text>
                </>
            )}
            {status === 'REJECTED' && rejectionReason && (
                <>
                    <Divider style={{ margin: '12px 0' }} />
                    <Text style={{ ...styles.detailLabel, display: 'block', marginBottom: 6 }}>거절 사유</Text>
                    <Text style={{ fontSize: fontSize.sm, color: colors.error.main }}>{rejectionReason}</Text>
                </>
            )}
        </Modal>
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
