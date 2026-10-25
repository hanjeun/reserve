import React from 'react';
import PropTypes from 'prop-types';
import { Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import reservationService from '../../services/reservationService';
import { reservationKeys } from '../../hooks/queryKeys';
import { DataState, ModalLoading } from '../common';
import ResponsiveModal from '../common/ResponsiveModal';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/*
 * 열린 모달의 QR 토큰은 서버에서 받아 브라우저에서만 그린다. 토큰의 유효기간에 맞춰 조회 캐시를 제한한다.
 */
const QrCodeModal = ({ reservationId, open, onClose }) => {
    const enabled = !!open && reservationId != null;
    const { data: token, error, isLoading, isError, isFetching, refetch } = useQuery({
        queryKey: reservationKeys.qrToken(reservationId),
        queryFn: async () => {
            const data = await reservationService.getQrToken(reservationId);
            return data.token;
        },
        enabled,
        staleTime: 0,
        gcTime: 0,
        retry: false,
    });

    return (
        <ResponsiveModal
            title="방문 체크인 QR"
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={340}
            mobileSize="content"
        >
            <div style={styles.wrapper}>
                {isLoading && (
                    <div style={styles.spinnerBox}><ModalLoading text="QR 코드를 불러오는 중..." minHeight="0" /></div>
                )}
                {/*
                 * QR의 4모듈 여백·고정된 밝은 배경과 어두운 코드를 유지해 다크 모드에서도 검출 경계를 보존한다.
                 */}
                {!isLoading && token && (
                    <div style={styles.qrPlate}>
                        <QRCodeSVG
                            value={token}
                            size={260}
                            level="M"
                            marginSize={4}
                            bgColor="#FFFFFF"
                            fgColor="#000000"
                        />
                    </div>
                )}
                {!isLoading && !token && (isError ? (
                    <DataState
                        state="error"
                        kind="reservation"
                        subject="QR 코드"
                        error={error}
                        title="QR 코드를 불러오지 못했어요."
                        onRetry={refetch}
                        retrying={isFetching}
                        compact
                        style={styles.errorState}
                    />
                ) : (
                    <Text type="secondary">QR 코드를 불러올 수 없어요.</Text>
                ))}
                <Text style={styles.hint}>
                    가게에 도착하면 이 QR을 사장님께 보여주세요
                </Text>
            </div>
        </ResponsiveModal>
    );
};

const styles = {
    wrapper:    { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '12px 0 4px' },
    // 다크 모드에서도 QR 뒤는 항상 흰색이어야 한다 — 토큰 색이 아니라 고정색이다.
    qrPlate:    { background: '#FFFFFF', borderRadius: 12, lineHeight: 0, padding: 0 },
    spinnerBox: { width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' },
    errorState: { width: '100%', minHeight: 148, margin: 0 },
    hint:       { fontSize: fontSize.sm, color: colors.text.secondary, textAlign: 'center' },
};

QrCodeModal.propTypes = {
    reservationId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    open: PropTypes.bool,
    onClose: PropTypes.func,
};

export default QrCodeModal;
