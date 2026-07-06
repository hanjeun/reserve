import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { Typography, Result } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import reservationService from '../../services/reservationService';
import { useMessage } from '../../hooks';
import { colors, fontSize } from '../../styles/tokens';

const { Text } = Typography;
const SCANNER_ELEMENT_ID = 'qr-checkin-scanner';

/**
 * QR 체크인 스캐너 (사업자용)
 * html5-qrcode가 카메라 권한 요청 UI, 카메라 선택, 스캔 영역 렌더링을 전부 처리함 —
 * 우리는 스캔 성공 콜백에서 디코딩된 문자열(토큰)을 서버로 보내기만 하면 됨.
 * QR 이미지 자체는 어디에도 저장되지 않고, 카메라 프레임에서 바로 디코딩됨.
 */
const QrScannerTab = () => {
    const { message } = useMessage();
    const scannerRef = useRef(null);
    // 같은 프레임에서 같은 QR이 연속으로 감지되어 중복 요청되는 것을 막는 락
    const processingRef = useRef(false);
    const [lastResult, setLastResult] = useState(null);

    const handleScanSuccess = useCallback(async (decodedText) => {
        if (processingRef.current) return;
        processingRef.current = true;
        try {
            const reservation = await reservationService.checkInByQr(decodedText);
            setLastResult(reservation);
            message.success(`${reservation.memberName || '고객'}님 예약이 체크인됐습니다.`);
        } catch (err) {
            message.error(err?.message || 'QR 체크인에 실패했습니다.');
        } finally {
            // 2초 텀을 두고 다시 스캔 허용 (같은 QR 연속 인식 방지)
            setTimeout(() => { processingRef.current = false; }, 2000);
        }
    }, [message]);

    useEffect(() => {
        const scanner = new Html5QrcodeScanner(
            SCANNER_ELEMENT_ID,
            { fps: 10, qrbox: { width: 250, height: 250 } },
            /* verbose= */ false
        );
        // 두 번째 인자(에러 콜백)는 프레임마다 "QR을 못 찾음"으로 계속 호출되므로 무시
        scanner.render(handleScanSuccess, () => {});
        scannerRef.current = scanner;

        return () => {
            scannerRef.current?.clear().catch(() => {});
        };
    }, [handleScanSuccess]);

    return (
        <div style={styles.wrapper}>
            <Text type="secondary" style={styles.hint}>
                고객의 예약 QR을 카메라로 비추면 자동으로 체크인(승인)됩니다.
            </Text>
            <div id={SCANNER_ELEMENT_ID} />
            {lastResult && (
                <Result
                    icon={<CheckCircleFilled style={{ color: colors.success.main }} />}
                    status="success"
                    title={`${lastResult.memberName || '고객'}님 체크인 완료`}
                    subTitle={`${lastResult.reservationDate} ${lastResult.reservationTime?.substring(0, 5) || ''} · ${lastResult.guestCount}명`}
                />
            )}
        </div>
    );
};

const styles = {
    wrapper: { maxWidth: 420, margin: '0 auto', paddingTop: 16, paddingBottom: 40 },
    hint:    { display: 'block', marginBottom: 16, fontSize: fontSize.sm },
};

export default QrScannerTab;
