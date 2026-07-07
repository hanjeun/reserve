import React, { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Typography } from 'antd';
import { QRCodeSVG } from 'qrcode.react';
import reservationService from '../../services/reservationService';
import { useMessage } from '../../hooks';
import { Loading } from '../common';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 예약 QR 코드 모달 (고객용)
 * 예약 상세를 열 때마다 서버에서 새 토큰을 받아와 그 자리에서 QR을 그림 —
 * 이미지 파일을 만들거나 저장하는 과정 없이 전부 브라우저에서 렌더링됨.
 */
const QrCodeModal = ({ reservationId, open, onClose }) => {
    const { message } = useMessage();
    const [token, setToken] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open || !reservationId) return;
        setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
        setToken(null);
        reservationService.getQrToken(reservationId)
            .then((data) => setToken(data.token))
            .catch(() => message.error('QR 코드를 불러오지 못했습니다.'))
            .finally(() => setLoading(false));
    }, [open, reservationId, message]);

    return (
        <Modal
            title="예약 확인 QR"
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={340}
        >
            <div style={styles.wrapper}>
                {loading ? (
                    <div style={styles.spinnerBox}><Loading minHeight="0" /></div>
                ) : token ? (
                    <QRCodeSVG value={token} size={220} level="M" />
                ) : (
                    <Text type="secondary">QR 코드를 불러올 수 없습니다.</Text>
                )}
                <Text style={styles.hint}>
                    가게에 도착하면 이 QR을 사장님께 보여주세요
                </Text>
            </div>
        </Modal>
    );
};

const styles = {
    wrapper:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0 4px' },
    spinnerBox: { width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    hint:       { fontSize: fontSize.sm, color: colors.text.secondary, textAlign: 'center' },
};

QrCodeModal.propTypes = {
    reservationId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    open: PropTypes.bool,
    onClose: PropTypes.func,
};

export default QrCodeModal;
