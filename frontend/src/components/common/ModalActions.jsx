import React from 'react';
import PropTypes from 'prop-types';
import Button from './Button';
import { colors } from '../../styles/tokens';

export const ModalActionGroup = ({ children }) => <div className="reserve-modal-actions">{children}</div>;
ModalActionGroup.propTypes = { children: PropTypes.node };

/** Paired modal decisions share size and shape; cancellation always has a visible border. */
const ModalActions = ({ onCancel, onConfirm, cancelText = '취소', confirmText = '확인', loading = false, disabled = false, cancelDisabled = false }) => (
    <ModalActionGroup>
        <Button variant="outline" size="sm" onClick={onCancel} disabled={cancelDisabled}>{cancelText}</Button>
        <Button variant="primary" size="sm" onClick={onConfirm} loading={loading} disabled={disabled}
            style={{ border: `1px solid ${colors.primary.main}` }}>{confirmText}</Button>
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
