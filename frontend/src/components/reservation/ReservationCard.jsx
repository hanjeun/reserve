import React, { useState } from 'react';
import { Modal, Input, Typography } from 'antd';
import {
    CheckOutlined, CloseOutlined,
    CheckCircleOutlined, WarningOutlined,
    UserOutlined, CalendarOutlined, ClockCircleOutlined, TeamOutlined,
} from '@ant-design/icons';
import ReservationStatusBadge from './ReservationStatusBadge';
import { Button } from '../common';
import { formatTime, formatCurrency, getThumbnailUrl } from '../../utils';
import { colors, radius, fontSize, fontWeight } from '../../styles/tokens';

const { TextArea } = Input;
const { Text } = Typography;

const ReservationCard = ({ reservation, actionLoading, onApprove, onReject, onComplete, onNoShow }) => {
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');

    const { id, memberName, storeName, storeMainImageUrl, reservationDate, reservationTime, guestCount, depositAmount, status, specialRequest } = reservation;

    const isActing = (key) => actionLoading === `${key}-${id}`;
    const hasAction = status === 'PENDING' || status === 'CONFIRMED';

    const handleRejectConfirm = () => {
        onReject(id, rejectReason);
        setRejectModalOpen(false);
        setRejectReason('');
    };

    return (
        <>
            <div style={styles.row}>
                {/* 이미지 */}
                <div style={styles.imgWrap}>
                    <img src={getThumbnailUrl(storeMainImageUrl)} alt={storeName} style={styles.img} />
                </div>

                {/* 정보 */}
                <div style={styles.info}>
                    <Text strong style={styles.storeName}>{storeName}</Text>
                    <div style={styles.meta}>
                        <span style={styles.metaItem}><UserOutlined style={styles.metaIcon} />{memberName}</span>
                        <span style={styles.dot}>·</span>
                        <span style={styles.metaItem}><CalendarOutlined style={styles.metaIcon} />{reservationDate}</span>
                        <span style={styles.dot}>·</span>
                        <span style={styles.metaItem}><ClockCircleOutlined style={styles.metaIcon} />{formatTime(reservationTime)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <span style={styles.guest}><TeamOutlined style={{ marginRight: 3, fontSize: 11 }} />{guestCount}명</span>
                        {specialRequest && (
                            <Text type="secondary" style={styles.special} ellipsis={{ tooltip: specialRequest }}>
                                &quot;{specialRequest}&quot;
                            </Text>
                        )}
                    </div>
                </div>

                {/* 우측: 상태 + 금액 + 액션버튼 */}
                <div style={styles.right}>
                    <ReservationStatusBadge status={status} />
                    <Text strong style={styles.price}>{formatCurrency(depositAmount)}</Text>
                    {hasAction && (
                        <div style={styles.actionGroup}>
                            {status === 'PENDING' && (
                                <>
                                    <Button
                                        variant="ghost-sm-primary"
                                        icon={<CheckOutlined style={{ fontSize: 11 }} />}
                                        loading={isActing('approve')}
                                        onClick={() => onApprove(id)}
                                    >
                                        승인
                                    </Button>
                                    <Button
                                        variant="ghost-sm-danger"
                                        icon={<CloseOutlined style={{ fontSize: 11 }} />}
                                        loading={isActing('reject')}
                                        onClick={() => setRejectModalOpen(true)}
                                    >
                                        거절
                                    </Button>
                                </>
                            )}
                            {status === 'CONFIRMED' && (
                                <>
                                    <Button
                                        variant="ghost-sm-success"
                                        icon={<CheckCircleOutlined style={{ fontSize: 11 }} />}
                                        loading={isActing('complete')}
                                        onClick={() => onComplete(id)}
                                    >
                                        완료
                                    </Button>
                                    <Button
                                        variant="ghost-sm-danger"
                                        icon={<WarningOutlined style={{ fontSize: 11 }} />}
                                        loading={isActing('noshow')}
                                        onClick={() => onNoShow(id)}
                                    >
                                        노쇼
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Modal
                title="예약 거절"
                open={rejectModalOpen}
                onOk={handleRejectConfirm}
                onCancel={() => { setRejectModalOpen(false); setRejectReason(''); }}
                okText="거절 확인" cancelText="닫기"
                okButtonProps={{ danger: true }} centered
            >
                <p style={{ color: colors.text.secondary, marginBottom: 12 }}>거절 사유를 입력하면 고객에게 표시됩니다. (선택)</p>
                <TextArea rows={3} placeholder="예) 해당 시간대 예약이 마감되었습니다."
                    value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={200} />
                <div style={{ textAlign: 'left', marginTop: 4, fontSize: 12, color: colors.text.tertiary }}>{rejectReason.length} / 200</div>
            </Modal>
        </>
    );
};

const styles = {
    row:      { display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0' },
    imgWrap:  { width: 60, height: 60, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 },
    img:      { width: '100%', height: '100%', objectFit: 'cover' },
    info:     { flex: 1, display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 },
    storeName:{ fontSize: fontSize.base, color: colors.text.primary, display: 'block', lineHeight: 1.3 },
    meta:     { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 2 },
    metaItem: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fontSize.xs, color: colors.text.secondary },
    metaIcon: { fontSize: 11, color: colors.text.tertiary },
    dot:      { color: colors.text.tertiary, fontSize: fontSize.xs },
    guest:    { fontSize: fontSize.xs, color: colors.text.secondary, display: 'inline-flex', alignItems: 'center' },
    special:  { fontSize: fontSize.xs, color: colors.text.secondary, maxWidth: 180 },
    right:    { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, minWidth: 70 },
    price:    { fontSize: fontSize.base, color: colors.text.primary },
    actionGroup: { display: 'flex', gap: 10 },
};

export default ReservationCard;
