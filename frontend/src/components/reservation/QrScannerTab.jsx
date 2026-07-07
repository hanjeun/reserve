import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Typography, Result } from 'antd';
import { QrcodeOutlined, CheckCircleFilled, ReloadOutlined } from '@ant-design/icons';
import { Button, Card } from '../common';
import reservationService from '../../services/reservationService';
import { useMessage } from '../../hooks';
import { colors, radius, fontSize, fontWeight } from '../../styles/tokens';

const { Text } = Typography;
const SCANNER_ELEMENT_ID = 'qr-checkin-scanner';

/**
 * QR 체크인 스캐너 (사업자용)
 *
 * html5-qrcode의 저수준 Html5Qrcode API를 사용 — Html5QrcodeScanner(자동 UI 생성 버전)는
 * 라이브러리 기본 스타일(권한 요청 버튼, 파일 스캔 링크 등)이 그대로 노출되어 우리 디자인
 * 시스템과 전혀 안 맞았음. 여기서는 카메라 시작/중지 버튼과 프리뷰 컨테이너를 전부 우리
 * Button/Card로 직접 그리고, 라이브러리는 카메라 스트림 디코딩만 담당하게 함.
 * QR 이미지 자체는 어디에도 저장되지 않고, 카메라 프레임에서 바로 디코딩됨.
 */
const QrScannerTab = () => {
    const { message } = useMessage();
    const html5QrRef = useRef(null);
    // 같은 프레임에서 같은 QR이 연속으로 감지되어 중복 요청되는 것을 막는 락
    const processingRef = useRef(false);

    const [status, setStatus] = useState('idle'); // idle | starting | scanning | error
    const [errorMsg, setErrorMsg] = useState('');
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

    const startScanning = useCallback(async () => {
        setStatus('starting');
        setErrorMsg('');
        try {
            const html5Qr = new Html5Qrcode(SCANNER_ELEMENT_ID);
            html5QrRef.current = html5Qr;
            await html5Qr.start(
                { facingMode: 'environment' },
                { fps: 10, qrbox: { width: 250, height: 250 } },
                handleScanSuccess,
                () => {} // 프레임마다 "QR을 못 찾음"으로 계속 호출되므로 무시
            );
            setStatus('scanning');
        } catch {
            setStatus('error');
            setErrorMsg('카메라를 시작할 수 없습니다. 브라우저 카메라 권한을 확인해주세요.');
        }
    }, [handleScanSuccess]);

    const stopScanning = useCallback(async () => {
        const scanner = html5QrRef.current;
        if (scanner?.isScanning) {
            try { await scanner.stop(); } catch { /* ignore */ }
        }
        setStatus('idle');
        setLastResult(null);
    }, []);

    useEffect(() => () => {
        if (html5QrRef.current?.isScanning) {
            html5QrRef.current.stop().catch(() => {});
        }
    }, []);

    return (
        <div style={styles.wrapper}>
            <Text type="secondary" style={styles.hint}>
                고객의 예약 QR을 카메라로 비추면 자동으로 체크인(승인)됩니다.
            </Text>

            {status === 'idle' && (
                <Card style={styles.stateCard}>
                    <div style={styles.stateCardInner}>
                        <QrcodeOutlined style={styles.stateIcon} />
                        <Button variant="primary" onClick={startScanning}>
                            카메라로 QR 스캔 시작
                        </Button>
                    </div>
                </Card>
            )}

            {status === 'starting' && (
                <Card style={styles.stateCard}>
                    <div style={styles.stateCardInner}>
                        <Text type="secondary">카메라를 준비하고 있어요…</Text>
                    </div>
                </Card>
            )}

            {status === 'error' && (
                <Card style={styles.stateCard}>
                    <div style={styles.stateCardInner}>
                        <Text style={{ color: colors.error.main, textAlign: 'center' }}>{errorMsg}</Text>
                        <Button variant="secondary" size="md" onClick={startScanning}>
                            <ReloadOutlined /> 다시 시도
                        </Button>
                    </div>
                </Card>
            )}

            <div
                id={SCANNER_ELEMENT_ID}
                style={{
                    ...styles.scannerBox,
                    display: status === 'scanning' ? 'block' : 'none',
                }}
            />

            {status === 'scanning' && (
                <div style={styles.scanningFooter}>
                    <span style={styles.scanningDot} />
                    <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary, flex: 1 }}>
                        스캔 대기 중…
                    </Text>
                    <Button variant="ghost-sm" onClick={stopScanning}>스캔 중지</Button>
                </div>
            )}

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
    wrapper:  { maxWidth: 420, margin: '0 auto', paddingTop: 16, paddingBottom: 40 },
    hint:     { display: 'block', marginBottom: 16, fontSize: fontSize.sm, textAlign: 'center' },
    stateCard: { padding: 0 },
    stateCardInner: {
        minHeight: 260,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: '32px 24px',
    },
    stateIcon: { fontSize: 48, color: colors.text.tertiary },
    scannerBox: {
        borderRadius: radius.xl,
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
        backgroundColor: '#000',
    },
    scanningFooter: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        padding: '10px 14px',
        borderRadius: radius.lg,
        backgroundColor: colors.gray[50],
    },
    scanningDot: {
        width: 8,
        height: 8,
        borderRadius: '50%',
        backgroundColor: colors.success.main,
        flexShrink: 0,
    },
};

export default QrScannerTab;
