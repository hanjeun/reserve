import React from 'react';
import PropTypes from 'prop-types';
import { Modal, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import reservationService from '../../services/reservationService';
import { reservationKeys } from '../../hooks/queryKeys';
import { ModalLoading } from '../common';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;

/**
 * 예약 QR 코드 모달 (고객용)
 * 모달을 열 때마다 서버에서 새 토큰을 받아와 그 자리에서 QR을 그린다 — 이미지 파일을 만들거나
 * 저장하는 과정 없이 전부 브라우저에서 렌더링.
 *
 * 2026-07: 토큰 로딩을 직접 useEffect+setState로 관리하던 것을 TanStack Query로 교체.
 * (effect 안 동기 setState를 막는 lint 룰 우회를 위해 eslint-disable를 달아뒀던 것을 제거 —
 *  이 프로젝트의 데이터 로딩 표준인 useQuery로 맞춤. enabled로 열렸을 때만 조회하고, QR 토큰은
 *  만료가 있으므로 staleTime 0 + 모달 닫힐 때 캐시가 남지 않게 gcTime을 짧게 둔다.)
 */
const QrCodeModal = ({ reservationId, open, onClose }) => {
    const enabled = !!open && reservationId != null;
    const { data: token, isLoading, isError } = useQuery({
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
        <Modal
            title="예약 확인 QR"
            open={open}
            onCancel={onClose}
            footer={null}
            centered
            width={340}
        >
            <div style={styles.wrapper}>
                {isLoading && (
                    <div style={styles.spinnerBox}><ModalLoading text="QR 코드를 불러오는 중..." minHeight="0" /></div>
                )}
                {!isLoading && token && (
                    <QRCodeSVG value={token} size={220} level="M" />
                )}
                {!isLoading && !token && (
                    <Text type="secondary">
                        {isError ? 'QR 코드를 불러오지 못했습니다.' : 'QR 코드를 불러올 수 없습니다.'}
                    </Text>
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
