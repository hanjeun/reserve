import React, { useState } from 'react';
import { Modal, Flex } from 'antd';
import {
    CheckOutlined, CloseOutlined,
    CheckCircleOutlined, WarningOutlined,
    DeleteOutlined, ExclamationCircleFilled, StopOutlined,
} from '@ant-design/icons';
import ReservationRow from './ReservationRow';
import ReservationDetailModal from './ReservationDetailModal';
import { Button, FormTextArea } from '../common';
import useMessage from '../../hooks/useMessage';
import { colors } from '../../styles/tokens';

/**
 * 사업자 예약 관리 탭(BusinessPanel)의 예약 한 줄.
 * 레이아웃(이미지/정보/상태/금액/모바일 액션바)은 ReservationRow 공용 컴포넌트를 쓰고,
 * 여기선 사업자 전용 액션(승인/거절/완료/노쇼/취소/삭제)과 사유 입력 모달만 담당한다.
 * 2026-07: 원래 손님 쪽(MyReservations.jsx)과 완전히 따로 구현돼 있던 걸 통합 —
 * 모바일 액션바(겹침 방지) 처리가 이 화면엔 없었던 게 통합의 계기였다.
 */

/**
 * 사유 입력 모달의 종류별 문구 (2026-08-11).
 *
 * <p>거절과 취소는 모달 구조가 같고 문구만 다르다. 모달을 두 벌 복사하지 않고 여기서 갈라 쓴다 —
 * 복사하면 나중에 한쪽에만 고친 게 반드시 생긴다(maskClosable 컨벤션이 실제로 그렇게 샜다).
 * 문구를 분리한 이유는 라벨이 다르기 때문이다. "거절"은 아직 승인 안 된 요청을 안 받는 것이고,
 * "취소"는 이미 확정된 약속을 가게가 깨는 것이라 이용자가 받는 의미가 전혀 다르다.
 */
const REASON_MODALS = {
    reject: {
        title: '예약 거절',
        description: '거절 사유를 입력하면 고객에게 표시됩니다. (선택)',
        placeholder: '예) 해당 시간대 예약이 마감되었습니다.',
        okText: '거절 확인',
    },
    cancel: {
        title: '예약 취소',
        // 환불을 여기서 반드시 알린다 — 사장님 돈이 나가는 동작인데 버튼만 보고는 알 수 없다.
        description: '확정된 예약을 취소합니다. 결제된 예약금은 고객에게 전액 환불됩니다.',
        placeholder: '예) 가게 사정으로 당일 휴무하게 되었습니다.',
        okText: '취소 확인',
    },
};

const ReservationCard = ({ reservation, actionLoading, onApprove, onReject, onComplete, onNoShow, onStoreCancel, onRemove }) => {
    // null | 'reject' | 'cancel'
    const [reasonModal, setReasonModal] = useState(null);
    const [reason, setReason] = useState('');
    const [detailOpen, setDetailOpen] = useState(false);
    const { confirm } = useMessage();

    const { id, status } = reservation;

    const isActing = (key) => actionLoading === `${key}-${id}`;
    // UNCONFIRMED = 승인됐는데 시간이 지나도록 처리가 안 된 건 (2026-08-11).
    // CONFIRMED 와 똑같은 버튼을 준다 — 처리를 안 했다는 이유로 처리 수단을 막으면 영영 못 닫는다.
    const isOpenConfirmed = status === 'CONFIRMED' || status === 'UNCONFIRMED';
    const hasAction = status === 'PENDING' || isOpenConfirmed;

    const closeReasonModal = () => { setReasonModal(null); setReason(''); };

    /**
     * 노쇼는 확인을 한 번 받는다 (2026-08-11).
     *
     * <p>거절·취소에는 사유 모달이 있어 손이 한 번 멈추는데, 노쇼만 <b>누르는 즉시 확정</b>이었다.
     * 완료 버튼 바로 옆이라 오조작이 쉽고, 되돌리는 수단도 없다.
     * 게다가 노쇼는 <b>손님에게 불이익이 남는 기록</b>이라 셋 중 가장 무거운데 가장 쉬웠다.
     * 사유는 받지 않는다 — 노쇼는 "안 왔다"는 사실 하나뿐이라 적을 게 없다.
     */
    const handleNoShow = () => {
        confirm({
            title: '노쇼 처리',
            content: '이 예약을 노쇼로 기록합니다. 고객에게 불이익이 남을 수 있고 되돌릴 수 없습니다.',
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

    const renderActions = () => {
        if (hasAction) {
            return (
                <>
                    {status === 'PENDING' && (
                        <>
                            <Button variant="ghost-sm-primary" loading={isActing('approve')} onClick={() => onApprove(id)}>
                                <CheckOutlined /> 승인
                            </Button>
                            <Button variant="ghost-sm-danger" loading={isActing('reject')} onClick={() => setReasonModal('reject')}>
                                <CloseOutlined /> 거절
                            </Button>
                        </>
                    )}
                    {/* CONFIRMED 는 버튼이 3개다. 모바일 폭 계산은 ReservationRow의 actionGroup 주석 참고 —
                        2글자 ghost-sm 버튼 3개(≈22.5px)에 gap 6이면 79.5px이라, 손님 쪽 최대치인
                        4버튼 125.6px보다 한참 여유가 있어 날짜가 잘리지 않는다. */}
                    {isOpenConfirmed && (
                        <>
                            <Button variant="ghost-sm-success" loading={isActing('complete')} onClick={() => onComplete(id)}>
                                <CheckCircleOutlined /> 완료
                            </Button>
                            <Button variant="ghost-sm-danger" loading={isActing('noshow')} onClick={handleNoShow}>
                                <WarningOutlined /> 노쇼
                            </Button>
                            {/* 2026-08-11 신설 — 그 전까지 가게에는 예약을 취소할 수단이 아예 없었다.
                                손님 쪽 취소 API는 예약자 본인만 통과해서(가게는 403) 사장님이 할 수 있는 게
                                "노쇼 처리"뿐이었고, 그건 오지 않은 손님을 벌하는 상태라 사실과 정반대로 기록된다. */}
                            <Button variant="ghost-sm" size="sm" loading={isActing('storecancel')}
                                onClick={() => setReasonModal('cancel')} style={{ color: colors.text.tertiary }}>
                                <StopOutlined /> 취소
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

            {/* ⚠️ open={reasonModal != null} 로 두고 문구만 갈아끼운다. Modal에 key를 주면 닫을 때
                언마운트돼 닫힘 애니메이션이 죽는다(antd 6 함정, CLAUDE.md 참고). reasonModal이
                null이 되는 순간 REASON_MODALS 조회도 없어지므로 문구는 fallback으로 방어한다. */}
            <Modal
                title={
                    <Flex align="center" gap={8}>
                        <ExclamationCircleFilled style={{ color: colors.error.main, fontSize: 18 }} />
                        <span>{REASON_MODALS[reasonModal]?.title ?? ''}</span>
                    </Flex>
                }
                open={reasonModal != null}
                /* maskClosable={false}: 사유를 작성하는 모달 — 바깥 클릭으로 내용 유실 방지.
                   컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
                   (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
                maskClosable={false}
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
