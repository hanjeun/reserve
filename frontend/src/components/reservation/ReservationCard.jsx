import React, { useState } from 'react';
import { Modal, Typography, Flex, Divider, Tooltip } from 'antd';
import {
    CheckOutlined, CloseOutlined,
    CheckCircleOutlined, WarningOutlined,
    UserOutlined, CalendarOutlined, ClockCircleOutlined, TeamOutlined,
    DeleteOutlined, ExclamationCircleFilled, MailOutlined, FileTextOutlined, DollarOutlined,
} from '@ant-design/icons';
import ReservationStatusBadge from './ReservationStatusBadge';
import { Button, FormTextArea } from '../common';
import { formatTime, formatCurrency, getThumbnailUrl } from '../../utils';
import { colors, radius, fontSize, fontWeight } from '../../styles/tokens';
import { useWindowWidth } from '../../hooks';

const { Text } = Typography;

const ReservationCard = ({ reservation, actionLoading, onApprove, onReject, onComplete, onNoShow, onRemove }) => {
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [detailOpen, setDetailOpen] = useState(false);
    const isWide = useWindowWidth() >= 576;

    const { id, memberName, memberEmail, storeName, storeMainImageUrl, reservationDate, reservationTime, guestCount, depositAmount, status, specialRequest, rejectionReason } = reservation;

    const isActing = (key) => actionLoading === `${key}-${id}`;
    const hasAction = status === 'PENDING' || status === 'CONFIRMED';

    const handleRejectConfirm = () => {
        onReject(id, rejectReason);
        setRejectModalOpen(false);
        setRejectReason('');
    };

    // PC: 메타 정보를 한 줄로 — 이름 · 명수 · 날짜 · 시간
    const metaItemsFlat = (
        <div style={styles.metaRowFlat}>
            <span style={styles.metaItem}><UserOutlined style={styles.metaIcon} />{memberName}</span>
            <span style={styles.dot}>·</span>
            <span style={styles.metaItem}><TeamOutlined style={styles.metaIcon} />{guestCount}명</span>
            <span style={styles.dot}>·</span>
            <span style={styles.metaItem}><CalendarOutlined style={styles.metaIcon} />{reservationDate}</span>
            <span style={styles.dot}>·</span>
            <span style={styles.metaItem}><ClockCircleOutlined style={styles.metaIcon} />{formatTime(reservationTime)}</span>
        </div>
    );

    // 모바일: 기존 2줄 레이아웃
    const metaItemsStacked = (
        <>
            <div style={styles.metaRow}>
                <span style={styles.metaItem}><UserOutlined style={styles.metaIcon} />{memberName}</span>
                <span style={styles.dot}>·</span>
                <span style={styles.metaItem}><TeamOutlined style={styles.metaIcon} />{guestCount}명</span>
            </div>
            <div style={styles.metaRow}>
                <span style={styles.metaItem}><CalendarOutlined style={styles.metaIcon} />{reservationDate}</span>
                <span style={styles.dot}>·</span>
                <span style={styles.metaItem}><ClockCircleOutlined style={styles.metaIcon} />{formatTime(reservationTime)}</span>
            </div>
        </>
    );

    return (
        <>
            <div style={styles.row}>
                {/* 이미지 - 클릭하면 상세 모달 */}
                <div style={{ ...(isWide ? styles.imgWrapWide : styles.imgWrap), cursor: 'pointer' }} onClick={() => setDetailOpen(true)}>
                    <img src={getThumbnailUrl(storeMainImageUrl)} alt={storeName} style={styles.img} />
                </div>

                {/* 정보 - 클릭하면 상세 모달 */}
                <div style={{ ...styles.info, cursor: 'pointer' }} onClick={() => setDetailOpen(true)}>
                    <Text strong style={isWide ? styles.storeNameWide : styles.storeName}>
                        {storeName}
                        {specialRequest && (
                            <Tooltip title="요청사항 있음 — 눌러서 확인">
                                <FileTextOutlined style={styles.requestIcon} />
                            </Tooltip>
                        )}
                    </Text>
                    {isWide ? metaItemsFlat : metaItemsStacked}
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
                                        loading={isActing('approve')}
                                        onClick={() => onApprove(id)}
                                    >
                                        승인
                                    </Button>
                                    <Button
                                        variant="ghost-sm-danger"
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
                                        loading={isActing('complete')}
                                        onClick={() => onComplete(id)}
                                    >
                                        완료
                                    </Button>
                                    <Button
                                        variant="ghost-sm-danger"
                                        loading={isActing('noshow')}
                                        onClick={() => onNoShow(id)}
                                    >
                                        노쇼
                                    </Button>
                                </>
                            )}
                        </div>
                    )}
                    {!hasAction && onRemove && (
                        <Button variant="ghost-sm" size="sm"
                            onClick={() => onRemove(id)}
                            style={{ color: colors.text.tertiary }}>
                            <DeleteOutlined /> 삭제
                        </Button>
                    )}
                </div>
            </div>

            <Modal
                title="예약 상세"
                open={detailOpen}
                onCancel={() => setDetailOpen(false)}
                footer={null}
                centered
            >
                <Flex align="center" justify="space-between" style={{ marginBottom: 4 }}>
                    <Text strong style={{ fontSize: fontSize.lg }}>{storeName}</Text>
                    <ReservationStatusBadge status={status} />
                </Flex>
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

            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                        <span>예약 거절</span>
                    </Flex>
                }
                open={rejectModalOpen}
                onOk={handleRejectConfirm}
                onCancel={() => { setRejectModalOpen(false); setRejectReason(''); }}
                okText="거절 확인" cancelText="닫기"
                okButtonProps={{ danger: true }} centered
            >
                <p style={{ color: colors.text.secondary, marginBottom: 12 }}>거절 사유를 입력하면 고객에게 표시됩니다. (선택)</p>
                <FormTextArea rows={3} placeholder="예) 해당 시간대 예약이 마감되었습니다."
                    value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} maxLength={200} showCount />
            </Modal>
        </>
    );
};

const styles = {
    row:          { display: 'flex', alignItems: 'center', gap: 16, padding: '18px 0' },
    imgWrap:      { width: 60, height: 60, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 },
    imgWrapWide:  { width: 72, height: 72, borderRadius: radius.lg, overflow: 'hidden', background: colors.gray[100], flexShrink: 0 },
    img:          { width: '100%', height: '100%', objectFit: 'cover' },
    info:         { flex: 1, display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 },
    storeName:    { fontSize: fontSize.base, color: colors.text.primary, display: 'block', lineHeight: 1.3 },
    storeNameWide:{ fontSize: fontSize.lg, color: colors.text.primary, display: 'block', lineHeight: 1.3, fontWeight: fontWeight.semibold },
    metaRow:      { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' },
    metaRowFlat:  { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    metaItem:     { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: fontSize.sm, color: colors.text.secondary, whiteSpace: 'nowrap' },
    metaIcon:     { fontSize: 12, color: colors.text.tertiary },
    dot:          { color: colors.text.tertiary, fontSize: fontSize.xs },
    special:      { fontSize: fontSize.xs, color: colors.text.secondary, maxWidth: 400 },
    requestIcon:  { fontSize: 12, color: colors.text.tertiary, marginLeft: 6 },
    right:        { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0, minWidth: 70 },
    price:        { fontSize: fontSize.base, color: colors.text.primary },
    actionGroup:  { display: 'flex', gap: 10 },
    detailRow:    { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0' },
    detailIcon:   { fontSize: 13, color: colors.text.tertiary, width: 16 },
    detailLabel:  { fontSize: fontSize.sm, color: colors.text.tertiary, width: 50, flexShrink: 0 },
    detailValue:  { fontSize: fontSize.sm, color: colors.text.primary },
};

export default ReservationCard;
