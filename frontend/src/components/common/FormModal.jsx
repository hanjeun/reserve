/**
 * RESERVE Design System - FormModal Component
 *
 * "작성해서 제출" 계열 모달(문의하기, 메일 작성, 새 광고 신청 등)의 공용 뼈대.
 * 너비 · 타이틀 스타일 · 취소/제출 버튼 스타일 · 필드 세로 간격을 한 곳에서 관리해서
 * 모달마다 이 값들이 조금씩 달라지는 걸 막는다.
 *
 * ── 취소 버튼 컨벤션 (2026-07 전수조사) ─────────────────────────────────
 * 예전엔 variant="ghost"(테두리 없는 텍스트형)을 썼는데, 나머지 모달은 사정이 달랐다:
 *   - AntD <Modal> 기본 footer (SanctionModal, 거절 모달 등)  → .ant-btn-default = 테두리 있음
 *   - modal.confirm() (useMessage().confirm, 18곳)              → .ant-btn-default = 테두리 있음
 *   - FormModal                                                 → ghost = 테두리 없음  ← 여기만 달랐다
 * 즉 "모달의 취소 버튼"이라는 같은 역할인데 FormModal만 혼자 테두리가 없어서,
 * 사용자 입장에선 "어떤 모달은 취소가 버튼 같고 어떤 모달은 그냥 글자"로 보였다.
 * → 테두리 있는 outline으로 통일. (outline = 1px solid border.default #e5e8eb —
 *   AntD 기본 버튼의 border.light #f2f4f6보다 오히려 뜼렷해서 더 버튼답다)
 *
 * 반면 테이블 행 액션·카드 액션바의 취소는 ghost-sm(텍스트형)을 유지한다 —
 * 테이블 안에 테두리 버튼을 줄지어 놓으면 오히려 지저분해진다.
 *
 * 사용법:
 * <FormModal title="문의하기" open={open} onClose={onClose} onSubmit={handleSubmit} submitting={sending}>
 *   <FormField label="제목"><FormInput ... /></FormField>
 *   <FormField label="내용"><FormTextArea ... /></FormField>
 * </FormModal>
 */
import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { Modal, Typography } from 'antd';
import Button from './Button';
// colors 는 더 이상 쓰지 않는다 — 에러 텍스트 색은 index.css 의 .reserve-field-error 가 맡는다.
import { fontSize, radius } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 폼 한 칸 — 라벨 + 입력 + (선택) 인라인 에러.
 *
 * error를 주면 입력칸 **바로 아래**에 빨간 글씨로 붙는다. 이게 정석인 이유:
 * 토스트는 몇 초 뒤 사라지므로 "어느 칸이 잘못됐는지"를 다시 확인할 방법이 없고,
 * 여러 칸이 동시에 틀리면 토스트가 겹쳐 쌓인다(실제로 문의하기에서 그렇게 됐다).
 * 토스트는 **필드에 귀속되지 않는 오류**(서버 오류, 네트워크 실패)에만 쓴다.
 *
 * role="alert" — 스크린리더가 에러가 생긴 순간 읽어준다.
 * 높이는 에러가 있을 때만 차지한다(항상 자리를 비워두면 폼이 성기게 보인다).
 */
export const FormField = ({ label, children, error }) => (
    <div>
        {label && (
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{label}</Text>
        )}
        {children}
        {/* ★ 스타일을 여기서 주지 않는다 — index.css 의 `.reserve-field-error` 가 유일한 출처다.
            그 규칙은 AntD 의 `.ant-form-item-explain*` 과 **같은 선택자 목록**에 들어 있어서,
            가게 등록(AntD Form.Item)과 이 모달(FormField)이 항상 같은 모양으로 나온다.
            예전에는 여기 인라인으로 marginTop/fontSize/color 를 박아둬서, AntD 쪽만 고쳤을 때
            이 화면은 그대로 남는 사고가 났다. */}
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
    scrollResetKey,
    children,
}) => {
    const contentRef = useRef(null);

    /* 다단계 폼에서 본문만 바뀌면 AntD의 같은 .ant-modal-body 노드를 재사용한다.
       이전 단계의 scrollTop까지 남겨두면 다음 단계 제목이 잘린 채 열린다. Modal에 key를 주면
       닫힘 애니메이션이 깨지므로, 단계 키가 바뀔 때 공용 본문 스크롤만 되돌린다. */
    useEffect(() => {
        if (!open) return;
        const modalBody = contentRef.current?.closest('.ant-modal-body');
        if (modalBody) modalBody.scrollTop = 0;
    }, [open, scrollResetKey]);

    return (
        <Modal
            title={<Text style={{ fontSize: fontSize.base, fontWeight: 700 }}>{title}</Text>}
            open={open}
            onCancel={onClose}
            afterClose={afterClose}
            rootClassName={rootClassName}
            /* maskClosable={false}: 문의/새 광고 신청/메일 작성 — 사용자가 직접 작성하는 모달이라 바깥 클릭으로 내용이 날아가면 안 된다.
               컨벤션 — 입력 폼/파괴적 확인 모달은 바깥 클릭으로 안 닫히고, 읽기 전용 모달
               (상세보기/QR/예약상세)은 AntD 기본값(true)대로 아무데나 눌러도 닫힌다. */
            maskClosable={false}
            footer={
                footer !== undefined ? footer : (
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                        {/* 취소 = 테두리 있는 outline (위 컨벤션 주석 참고) */}
                        <Button variant="outline" size="sm" onClick={onCancelAction || onClose} disabled={submitting}
                            style={{ borderRadius: radius.xl }}>
                            {cancelText}
                        </Button>
                        <Button variant="primary" size="sm" loading={submitting} disabled={submitDisabled} onClick={onSubmit}
                            style={{ borderRadius: radius.xl }}>
                            {submitText}
                        </Button>
                    </div>
                )
            }
            width={width}
            centered
        >
            <div ref={contentRef} style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
                {children}
            </div>
        </Modal>
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
    /** 값이 바뀌면 재사용 중인 모달 본문의 scrollTop을 0으로 되돌린다. */
    scrollResetKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    children: PropTypes.node,
};

export default FormModal;
