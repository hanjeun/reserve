import React, { useState } from 'react';
import { Modal, Flex } from 'antd';
import {
    CheckOutlined, CloseOutlined,
    CheckCircleOutlined, WarningOutlined,
    DeleteOutlined, ExclamationCircleFilled, StopOutlined,
} from '../common/icons';
import ReservationRow from './ReservationRow';
import ReservationSummaryCard from './ReservationSummaryCard';
import ReservationDetailModal from './ReservationDetailModal';
import { Button, FormTextArea } from '../common';
import useMessage from '../../hooks/useMessage';
import { colors } from '../../styles/tokens';

/*
 * 공통 예약 행에 사업자 전용 실행 도구·사유 모달을 연결한다.
 */

/*
 * 거절·취소는 입력 모달을 공유하되 사용자에게 전달할 상태 의미는 구분한다.
 */
const REASON_MODALS = {
    reject: {
        title: '예약 거절',
        description: '거절 사유를 입력하면 고객에게 표시돼요. (선택)',
        placeholder: '예) 해당 시간대 예약이 마감됐어요.',
        okText: '거절 확인',
    },
    cancel: {
        title: '예약 취소',
        // 환불을 여기서 반드시 알린다 — 사장님 돈이 나가는 동작인데 버튼만 보고는 알 수 없다.
        description: '확정된 예약을 취소해요. 결제된 예약금은 고객에게 전액 환불돼요.',
        placeholder: '예) 가게 사정으로 당일 휴무하게 됐어요.',
        okText: '취소 확인',
    },
};

const ReservationCard = ({ reservation, actionLoading, onApprove, onReject, onComplete, onNoShow, onStoreCancel, onRemove, view = 'list' }) => {
    // null | 'reject' | 'cancel'
    const [reasonModal, setReasonModal] = useState(/** @type {'reject' | 'cancel' | null} */ (null));
    const [reason, setReason] = useState('');
    const [detailOpen, setDetailOpen] = useState(false);
    const { confirm } = useMessage();

    const { id, status } = reservation;

    const isActing = (key) => actionLoading === `${key}-${id}`;
    // 승인 뒤 처리가 지연된 예약은 미처리 상태로 구분한다.

    const isOpenConfirmed = status === 'CONFIRMED' || status === 'UNCONFIRMED';
    const hasAction = status === 'PENDING' || isOpenConfirmed;

    const closeReasonModal = () => { setReasonModal(null); setReason(''); };

    /*
     * 손님에게 남는 노쇼 기록은 실행 전에 확인한다.
     */
    const handleNoShow = () => {
        confirm({
            title: '노쇼 처리',
            content: '이 예약을 노쇼로 기록해요. 고객에게 불이익이 남을 수 있고 되돌릴 수 없어요.',
            okText: '노쇼 확인', cancelText: '닫기',
            okButtonProps: { danger: true }, centered: true,
            onOk: () => onNoShow(id),
        });
    };

    const handleReasonConfirm = () => {
        if (reasonModal === 'reject') onReject(id, reason);
        else if (reasonModal === 'cancel') onStoreCancel(id, reason);
        closeReasonModal();
    };

    const createActions = () => {
        if (hasAction) {
            if (status === 'PENDING') {
                return [
                    <Button key="approve" variant="ghost-sm-primary" loading={isActing('approve')} onClick={() => onApprove(id)}>
                        <CheckOutlined /> 승인
                    </Button>,
                    <Button key="reject" variant="ghost-sm-danger" loading={isActing('reject')} onClick={() => setReasonModal('reject')}>
                        <CloseOutlined /> 거절
                    </Button>,
                ];
            }
            // 확정 예약은 완료·노쇼·가게 취소 세 칸을 같은 폭으로 둔다.
            return [
                <Button key="complete" variant="ghost-sm-success" loading={isActing('complete')} onClick={() => onComplete(id)}>
                    <CheckCircleOutlined /> 완료
                </Button>,
                <Button key="noshow" variant="ghost-sm-danger" loading={isActing('noshow')} onClick={handleNoShow}>
                    <WarningOutlined /> 노쇼
                </Button>,
                <Button key="cancel" variant="ghost-sm-danger" loading={isActing('storecancel')}
                    onClick={() => setReasonModal('cancel')}>
                    <StopOutlined /> 취소
                </Button>,
            ];
        }
        if (onRemove) {
            return [
                <Button key="remove" variant="ghost-sm" size="sm" onClick={() => onRemove(id)} style={{ color: colors.text.tertiary }}>
                    <DeleteOutlined /> 삭제
                </Button>,
            ];
        }
        return [];
    };

    const actions = createActions();

    return (
        <>
            {view === 'cards' ? (
                <ReservationSummaryCard
                    reservation={reservation}
                    onOpenDetail={() => setDetailOpen(true)}
                    showMemberInfo
                    actions={actions}
                />
            ) : (
                <ReservationRow
                    reservation={reservation}
                    onOpenDetail={() => setDetailOpen(true)}
                    // 사업자는 누가 예약했는지가 중요하므로 PC에서 이름·인원을 날짜 줄에 함께 보여준다.
                    // 모바일은 폭이 없어 날짜·시간만 — 이름은 카드를 눌러 상세에서 확인한다.
                    showMemberInfo
                    renderActions={() => actions}
                />
            )}

            <ReservationDetailModal
                reservation={reservation}
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
            />

            {/*
             * 닫힘 모션을 유지하도록 모달 key를 바꾸지 않고 닫힘 중 문구는 대체값으로 유지한다.
             */}
            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                        <span>{REASON_MODALS[reasonModal]?.title ?? ''}</span>
                    </Flex>
                }
                open={reasonModal != null}
                /*
                 * 사유 입력이 바깥 클릭으로 유실되지 않게 한다.
                 */
                mask={{ closable: false }}
                onOk={handleReasonConfirm}
                onCancel={closeReasonModal}
                okText={REASON_MODALS[reasonModal]?.okText ?? '확인'} cancelText="닫기"
                okButtonProps={{ danger: true }} centered
            >
                <p style={{ color: colors.text.secondary, marginBottom: 12 }}>
                    {REASON_MODALS[reasonModal]?.description ?? ''}
                </p>
                <FormTextArea rows={3} placeholder={REASON_MODALS[reasonModal]?.placeholder ?? ''}
                    value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} showCount />
            </Modal>
        </>
    );
};

export default ReservationCard;
