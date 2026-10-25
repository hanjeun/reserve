import React from 'react';
import PropTypes from 'prop-types';
import Button from './Button';

export const ModalActionGroup = ({ children }) => <div className="reserve-modal-actions">{children}</div>;
ModalActionGroup.propTypes = { children: PropTypes.node };

/* 모달 결정 버튼은 높이·여백을 공유하고 너비는 문구에 맞춘다. */
const ModalActions = ({ onCancel, onConfirm, cancelText = '취소', confirmText = '확인', loading = false, disabled = false, cancelDisabled = false }) => (
    <ModalActionGroup>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelDisabled}>{cancelText}</Button>
        <Button variant="primary" size="sm" onClick={onConfirm} loading={loading} disabled={disabled}>{confirmText}</Button>
    </ModalActionGroup>
);

ModalActions.propTypes = {
    onCancel: PropTypes.func,
    onConfirm: PropTypes.func,
    cancelText: PropTypes.node,
    confirmText: PropTypes.node,
    loading: PropTypes.bool,
    disabled: PropTypes.bool,
    cancelDisabled: PropTypes.bool,
};

export default ModalActions;
