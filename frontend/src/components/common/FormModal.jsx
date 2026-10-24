/**
 * 작성·제출 모달의 너비·제목·필드 간격과 취소·제출 액션을 관리한다.
 * 하단 액션은 공용 ModalActions에 맡겨 같은 역할의 모달 버튼과 모양을 맞춘다.
 * 테이블·카드 안의 작은 텍스트 액션과는 역할을 구분한다.
 */
import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import ResponsiveModal from './ResponsiveModal';
import ModalActions from './ModalActions';
// colors 는 더 이상 쓰지 않는다 — 에러 텍스트 색은 index.css 의 .reserve-field-error 가 맡는다.
import { fontSize } from '../../styles/tokens';
import useWorkspaceDraftGuard from '../../hooks/useWorkspaceDraftGuard';

const { Text } = Typography;

/**
 * 라벨·입력·필드 오류를 묶는다. 필드 오류는 해당 입력 아래의 alert로 표시한다.
 * 서버·네트워크 오류 같은 전체 결과 안내와 구분하고 오류가 있을 때만 공간을 차지한다.
 */
export const FormField = ({ label, children, error }) => (
    <div>
        {label && (
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{label}</Text>
        )}
        {children}
        {/* FormField와 AntD Form.Item이 같은 오류 규격을 사용하도록 전역 CSS가 스타일을 담당한다. */}
        {error && (
            <span className="reserve-field-error" role="alert">{error}</span>
        )}
    </div>
);

FormField.propTypes = {
    label: PropTypes.string,
    children: PropTypes.node,
    error: PropTypes.string,
};

const FormModal = ({
    title,
    open,
    onClose,
    afterClose,
    onCancelAction,
    onSubmit,
    submitting = false,
    submitText = '보내기',
    cancelText = '취소',
    submitDisabled = false,
    width = 520,
    footer,
    rootClassName,
    mobileSize = 'form',
    mobileSheet = true,
    scrollResetKey,
    navigationDirty = false,
    navigationAllowUnload = false,
    children,
}) => {
    const contentRef = useRef(null);
    const requestClose = useWorkspaceDraftGuard({ dirty: open && navigationDirty, busy: open && submitting,
        allowUnload: navigationAllowUnload, onDiscard: onClose });
    const close = () => requestClose(() => onClose?.(), { discard: false });

    /* 다단계 폼에서 본문만 바뀌면 AntD의 같은 .ant-modal-body 노드를 재사용한다.
       이전 단계의 scrollTop까지 남겨두면 다음 단계 제목이 잘린 채 열린다. Modal에 key를 주면
       닫힘 애니메이션이 깨지므로, 단계 키가 바뀔 때 공용 본문 스크롤만 되돌린다. */
    useEffect(() => {
        if (!open) return;
        const modalBody = contentRef.current?.closest('.ant-modal-body');
        if (modalBody) modalBody.scrollTop = 0;
    }, [open, scrollResetKey]);

    return (
        <ResponsiveModal
            title={<Text style={{ fontSize: fontSize.base, fontWeight: 700 }}>{title}</Text>}
            open={open}
            onCancel={close}
            afterClose={afterClose}
            rootClassName={rootClassName}
            mobileSize={mobileSize}
            mobileSheet={mobileSheet}
            /* mask.closable=false: 문의/새 광고 신청/메일 작성 — 사용자가 직접 작성하는 모달이라 바깥 클릭으로 내용이 날아가면 안 된다.
               컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
               (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
            mask={{ closable: false }}
            footer={
                footer !== undefined ? footer : (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                        <ModalActions onCancel={onCancelAction && onCancelAction !== onClose ? onCancelAction : close} onConfirm={onSubmit}
                            cancelText={cancelText} confirmText={submitText}
                            loading={submitting} disabled={submitDisabled} cancelDisabled={submitting} />
                    </div>
                )
            }
            width={width}
            centered
        >
            <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                {children}
            </div>
        </ResponsiveModal>
    );
};

FormModal.propTypes = {
    title: PropTypes.node,
    open: PropTypes.bool,
    onClose: PropTypes.func,
    /** 닫힘 애니메이션 뒤 조건부 부모가 폼을 제거할 때 사용한다. */
    afterClose: PropTypes.func,
    /** 닫기 X와 별개인 footer 보조 동작. 다단계 폼의 이전 버튼 등에 사용한다. */
    onCancelAction: PropTypes.func,
    onSubmit: PropTypes.func,
    submitting: PropTypes.bool,
    submitText: PropTypes.string,
    cancelText: PropTypes.string,
    submitDisabled: PropTypes.bool,
    width: PropTypes.number,
    footer: PropTypes.node,
    rootClassName: PropTypes.string,
    mobileSize: PropTypes.oneOf(['content', 'tall', 'form']),
    mobileSheet: PropTypes.bool,
    /** 값이 바뀌면 재사용 중인 모달 본문의 scrollTop을 0으로 되돌린다. */
    scrollResetKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    children: PropTypes.node,
    navigationDirty: PropTypes.bool,
    navigationAllowUnload: PropTypes.bool,
};

export default FormModal;
