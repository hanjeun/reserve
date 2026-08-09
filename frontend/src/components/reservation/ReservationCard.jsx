import React, { useState } from 'react';
import { Modal, Flex } from 'antd';
import {
    CheckOutlined, CloseOutlined,
    CheckCircleOutlined, WarningOutlined,
    DeleteOutlined, ExclamationCircleFilled,
} from '@ant-design/icons';
import ReservationRow from './ReservationRow';
import ReservationDetailModal from './ReservationDetailModal';
import { Button, FormTextArea } from '../common';
import { colors } from '../../styles/tokens';

/**
 * 사업자 예약 관리 탭(BusinessPanel)의 예약 한 줄.
 * 레이아웃(이미지/정보/상태/금액/모바일 액션바)은 ReservationRow 공용 컴포넌트를 쓰고,
 * 여기선 사업자 전용 액션(승인/거절/완료/노쇼/삭제)과 거절 사유 모달만 담당한다.
 * 2026-07: 원래 손님 쪽(MyReservations.jsx)과 완전히 따로 구현돼 있던 걸 통합 —
 * 모바일 액션바(겹침 방지) 처리가 이 화면엔 없었던 게 통합의 계기였다.
 */
const ReservationCard = ({ reservation, actionLoading, onApprove, onReject, onComplete, onNoShow, onRemove }) => {
    const [rejectModalOpen, setRejectModalOpen] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [detailOpen, setDetailOpen] = useState(false);

    const { id, status } = reservation;

    const isActing = (key) => actionLoading === `${key}-${id}`;
    const hasAction = status === 'PENDING' || status === 'CONFIRMED';

    const handleRejectConfirm = () => {
        onReject(id, rejectReason);
        setRejectModalOpen(false);
        setRejectReason('');
    };

    const renderActions = () => {
        if (hasAction) {
            return (
                <>
                    {status === 'PENDING' && (
                        <>
                            <Button variant="ghost-sm-primary" loading={isActing('approve')} onClick={() => onApprove(id)}>
                                <CheckOutlined /> 승인
                            </Button>
                            <Button variant="ghost-sm-danger" loading={isActing('reject')} onClick={() => setRejectModalOpen(true)}>
                                <CloseOutlined /> 거절
                            </Button>
                        </>
                    )}
                    {status === 'CONFIRMED' && (
                        <>
                            <Button variant="ghost-sm-success" loading={isActing('complete')} onClick={() => onComplete(id)}>
                                <CheckCircleOutlined /> 완료
                            </Button>
                            <Button variant="ghost-sm-danger" loading={isActing('noshow')} onClick={() => onNoShow(id)}>
                                <WarningOutlined /> 노쇼
                            </Button>
                        </>
                    )}
                </>
            );
        }
        if (onRemove) {
            return (
                <Button variant="ghost-sm" size="sm" onClick={() => onRemove(id)} style={{ color: colors.text.tertiary }}>
                    <DeleteOutlined /> 삭제
                </Button>
            );
        }
        return null;
    };

    return (
        <>
            <ReservationRow
                reservation={reservation}
                onOpenDetail={() => setDetailOpen(true)}
                // 사업자는 누가 예약했는지가 중요하므로 PC에서 이름·인원을 날짜 줄에 함께 보여준다.
                // 모바일은 폭이 없어 날짜·시간만 — 이름은 카드를 눌러 상세에서 확인한다.
                showMemberInfo
                renderActions={renderActions}
            />

            <ReservationDetailModal
                reservation={reservation}
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
            />

            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                        <span>예약 거절</span>
                    </Flex>
                }
                open={rejectModalOpen}
                /* maskClosable={false}: 예약 거절 사유를 작성하는 모달 — 바깥 클릭으로 내용 유실 방지.
                   컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
                   (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
                maskClosable={false}
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

export default ReservationCard;
