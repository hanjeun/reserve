/**
 * RESERVE Design System - FormModal Component
 *
 * "작성해서 제출" 계열 모달(문의하기, 메일 작성 등)의 공용 뼈대.
 * 너비 · 타이틀 스타일 · 취소/제출 버튼 스타일 · 필드 세로 간격을 한 곳에서 관리해서
 * 모달마다 이 값들이 조금씩 달라지는 걸 막는다.
 *
 * 사용법:
 * <FormModal title="문의하기" open={open} onClose={onClose} onSubmit={handleSubmit} submitting={sending}>
 *   <FormField label="제목"><FormInput ... /></FormField>
 *   <FormField label="내용"><FormTextArea ... /></FormField>
 * </FormModal>
 */
import React from 'react';
import PropTypes from 'prop-types';
import { Modal, Typography } from 'antd';
import Button from './Button';
import { fontSize, radius } from '../../styles/tokens';

const { Text } = Typography;

export const FormField = ({ label, children }) => (
    <div>
        {label && (
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>{label}</Text>
        )}
        {children}
    </div>
);

FormField.propTypes = {
    label: PropTypes.string,
    children: PropTypes.node,
};

const FormModal = ({
    title,
    open,
    onClose,
    onSubmit,
    submitting = false,
    submitText = '보내기',
    cancelText = '취소',
    submitDisabled = false,
    width = 520,
    footer,
    children,
}) => (
    <Modal
        title={<Text style={{ fontSize: fontSize.base, fontWeight: 700 }}>{title}</Text>}
        open={open}
        onCancel={onClose}
        footer={
            footer !== undefined ? footer : (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
                    <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
                        {cancelText}
                    </Button>
                    <Button variant="primary" size="sm" loading={submitting} disabled={submitDisabled} onClick={onSubmit}
                        style={{ borderRadius: radius.xl, paddingLeft: 24, paddingRight: 24 }}>
                        {submitText}
                    </Button>
                </div>
            )
        }
        width={width}
        centered
    >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 8 }}>
            {children}
        </div>
    </Modal>
);

FormModal.propTypes = {
    title: PropTypes.node,
    open: PropTypes.bool,
    onClose: PropTypes.func,
    onSubmit: PropTypes.func,
    submitting: PropTypes.bool,
    submitText: PropTypes.string,
    cancelText: PropTypes.string,
    submitDisabled: PropTypes.bool,
    width: PropTypes.number,
    footer: PropTypes.node,
    children: PropTypes.node,
};

export default FormModal;
