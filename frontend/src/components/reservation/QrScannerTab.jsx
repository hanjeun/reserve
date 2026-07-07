import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Typography, Result } from 'antd';
import { QrcodeOutlined, CheckCircleFilled, ReloadOutlined } from '@ant-design/icons';
import { Button } from '../common';
import reservationService from '../../services/reservationService';
import { useMessage } from '../../hooks';
import { colors, radius, fontSize } from '../../styles/tokens';

const { Text } = Typography;
const SCANNER_ELEMENT_ID = 'qr-checkin-scanner';

/**
 * QR 체크인 스캐너 (사업자용)
 *
 * html5-qrcode의 저수준 Html5Qrcode API를 사용 — Html5QrcodeScanner(자동 UI 생성 버전)는
 * 라이브러리 기본 스타일이 그대로 노출되어 우리 디자인 시스템과 안 맞았고, 카메라 시작/중지
 * 버튼과 프리뷰 컨테이너를 전부 우리 Button으로 직접 그림. QR 이미지 자체는 어디에도 저장되지
 * 않고 카메라 프레임에서 바로 디코딩됨.
 *
 * [중요] 스캐너를 붙일 div(#qr-checkin-scanner)는 항상 렌더링된 상태(display:none으로 감추지
 * 않음)를 유지해야 함 — Html5Qrcode가 시작 시점에 컨테이너의 실제 너비/높이를 읽어서 비디오
 * 엘리먼트 크기를 잡는데, display:none이면 0×0으로 계산되어 카메라를 시작해도 화면에 아무것도
 * 안 보이는 문제가 있었음(2026-07-07 발견). 그래서 idle/starting/error 상태는 이 컨테이너
 * "안"에서 절대위치 오버레이로 겹쳐 보여주는 구조로 바꿈.
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

            {/* 스캐너 프리뷰 박스 — 항상 렌더링(display:none 금지), 오버레이만 상태별로 전환 */}
            <div style={styles.previewBox}>
                <div id={SCANNER_ELEMENT_ID} style={styles.scannerFill} />

                {status !== 'scanning' && (
                    <div style={styles.overlay}>
                        {status === 'idle' && (
                            <>
                                <QrcodeOutlined style={styles.stateIcon} />
                                <Button variant="primary" onClick={startScanning}>
                                    카메라로 QR 스캔 시작
                                </Button>
                            </>
                        )}
                        {status === 'starting' && (
                            <Text type="secondary">카메라를 준비하고 있어요…</Text>
                        )}
                        {status === 'error' && (
                            <>
                                <Text style={{ color: colors.error.main, textAlign: 'center', padding: '0 24px' }}>{errorMsg}</Text>
                                <Button variant="secondary" size="md" onClick={startScanning}>
                                    <ReloadOutlined /> 다시 시도
                                </Button>
                            </>
                        )}
                    </div>
                )}
            </div>

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
    previewBox: {
        position: 'relative',
        width: '100%',
        aspectRatio: '1 / 1',
        borderRadius: radius.xl,
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
        backgroundColor: '#000',
    },
    scannerFill: { width: '100%', height: '100%' },
    overlay: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        backgroundColor: colors.gray[50],
    },
    stateIcon: { fontSize: 48, color: colors.text.tertiary },
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
