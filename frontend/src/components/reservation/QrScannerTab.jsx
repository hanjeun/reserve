import LoadingStatus from '../common/LoadingStatus';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Html5Qrcode } from 'html5-qrcode';
import { Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import StateIllustration from '../common/StateIllustration';
import { cameraFailurePresentation, unsupportedCameraPresentation } from './qrCameraPresentation';
import QrTrackingGuide from './QrTrackingGuide';
import QrScanResult from './QrScanResult';
import { Button, Bone } from '../common';
import reservationService from '../../services/reservationService';
import waitingService from '../../services/waitingService';
import { useMessage } from '../../hooks';
import useQrCameraLifecycle from '../../hooks/useQrCameraLifecycle';
import { invalidateReservationData } from '../../hooks/invalidateAfterWrite';
import { colors, radius, shadows, fontSize } from '../../styles/tokens';

const { Text } = Typography;
const SCANNER_ELEMENT_ID = 'qr-checkin-scanner';

// 디코더는 영상의 CSS 크기로 캔버스를 만들므로 가로 720px을 유지하고 화면 표시만 축소한다.

const DECODE_WIDTH = 720;
const DEFAULT_PREVIEW_SCALE = 302 / DECODE_WIDTH;

// 컨테이너 비율을 실제 영상 비율에 맞춰 QR 모듈이 눌리지 않게 한다.

// 디코딩 너비를 유지하고 높이만 실제 영상 비율로 계산한다.

const DEFAULT_DECODE_ASPECT = 16 / 9;
const decodeHeightFor = (aspect) => Math.round(DECODE_WIDTH / aspect);
// 이 이상 어긋나면 재시작해서 고친다. 1~2%는 반올림 오차라 재시작할 값어치가 없다.
const ASPECT_TOLERANCE = 0.02;
// 재시작 상한. 카메라가 비율을 흔들어도 무한 재시작에 빠지지 않게 한다.
const MAX_ASPECT_FIXES = 3;

/*
 * 숨겨진 0 크기 영역에서는 스캐너를 시작하지 않는다. 안내선은 디코딩과 분리하며 이탈 시 카메라·타이머를 정리한다.
 */
const QrScannerTab = ({ sheet = false, onClose }) => {
    const { message } = useMessage();
    const queryClient = useQueryClient();
    const html5QrRef = useRef(/** @type {import('html5-qrcode').Html5Qrcode | null} */ (null));
    const { stopCamera, trackStartup } = useQrCameraLifecycle();
    const scanGenerationRef = useRef(0);
    const startBusyRef = useRef(false);
    const decodeCheckTimerRef = useRef(null);
    // 같은 프레임에서 같은 QR이 연속으로 감지되어 중복 요청되는 것을 막는 락
    const processingRef = useRef(false);
    const lastDecodedRef = useRef(null);
    const consecutiveMissesRef = useRef(0);

    const [status, setStatus] = useState('idle'); // idle | starting | scanning | error
    const [errorMsg, setErrorMsg] = useState('');
    const [errorIcon, setErrorIcon] = useState('camera-unavailable');
    const [scanResult, setScanResult] = useState(null);
    const [processing, setProcessing] = useState(false);

    // 프레임 콜백 횟수로 디코딩 루프의 시작 여부를 확인한다.
    const decodeTickRef = useRef(0);
    const resumeTimerRef = useRef(null);
    const previewRef = useRef(null);
    const [previewScale, setPreviewScale] = useState(DEFAULT_PREVIEW_SCALE);

    // 디코딩 컨테이너의 종횡비 — 카메라가 실제로 주는 비율을 따라간다(위 DEFAULT_DECODE_ASPECT 주석).
    // ref 를 같이 두는 이유: 보정 판단이 startScanning 콜백 안에서 일어나는데,
    // 그 콜백은 렌더 시점의 state 를 캡처하고 있어 최신값을 못 본다.
    const [decodeAspect, setDecodeAspect] = useState(DEFAULT_DECODE_ASPECT);
    const decodeAspectRef = useRef(DEFAULT_DECODE_ASPECT);
    // 카메라가 비율을 오락가락 보고해도 재시작 루프에 빠지지 않도록 횟수를 제한한다.
    // (자기 제한이 이미 걸려 있다 — 보정 후 decodeAspectRef === actual 이라 다음 측정은 통과한다.
    //  이 카운터는 하드웨어가 값을 흔들 때를 위한 안전장치다.)
    const aspectFixCountRef = useRef(0);
    const restartForAspectRef = useRef(false);
    const aspectWatcherCleanupRef = useRef(null);

    const decodeHeight = decodeHeightFor(decodeAspect);

    // 정사각 안내선은 영상 프레임의 짧은 변을 기준으로 계산한다.

    // 카메라의 실제 비율이 확정되면 컨테이너 높이를 보정한다.

    // qrdebug=1일 때만 화면에 카메라 진단값을 표시한다.

    const debugOn = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('qrdebug') === '1';
    const [debugInfo, setDebugInfo] = useState(null);

    // 카메라 준비 중에도 동일한 로딩 배치를 유지한다.

    const [ready, setReady] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setReady(true), 400);
        return () => clearTimeout(t);
    }, []);

    // 디코딩 영역의 레이아웃 크기는 유지하고 화면 표시만 축소한다.
    // (레이아웃 크기는 720 그대로여야 디코딩 캔버스가 720이 된다 — 위 DECODE_WIDTH 주석)
    useEffect(() => {
        if (!ready) return undefined;
        const el = previewRef.current;
        if (!el) return undefined;
        const update = () => {
            const w = el.clientWidth;
            if (w > 0) setPreviewScale(w / DECODE_WIDTH);
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(el);
        return () => observer.disconnect();
    }, [ready]);

    // qrdebug=1일 때만 카메라 진단값을 주기적으로 갱신한다.
    useEffect(() => {
        if (!debugOn || status !== 'scanning') return undefined;
        const tick = () => {
            const el = document.getElementById(SCANNER_ELEMENT_ID);
            const v = el?.querySelector('video');
            const c = el?.querySelector('canvas');
            if (!v || !c) return;
            const nw = v.videoWidth;
            const nh = v.videoHeight;
            setDebugInfo({
                native: `${nw}x${nh}`,
                canvas: `${c.width}x${c.height}`,
                // 영상과 캔버스의 비율 차이를 진단한다.
                nativeAspect: nh ? (nw / nh).toFixed(3) : '-',
                canvasAspect: c.height ? (c.width / c.height).toFixed(3) : '-',
                // 프레임 콜백 횟수로 디코딩 루프의 시작 여부를 확인한다.
                ticks: decodeTickRef.current,
                fixes: aspectFixCountRef.current,
            });
        };
        tick();
        const id = setInterval(tick, 500);
        return () => clearInterval(id);
    }, [debugOn, status]);

    const handleScanSuccess = useCallback(async (decodedText) => {
        const scanner = html5QrRef.current;
        if (!scanner) return;
        consecutiveMissesRef.current = 0;
        if (processingRef.current || lastDecodedRef.current === decodedText) return;
        lastDecodedRef.current = decodedText;
        processingRef.current = true;
        setProcessing(true);
        const isWaiting = decodedText.startsWith('rw1.e.');
        const kind = isWaiting ? 'waiting' : 'reservation';
        setScanResult({ kind, state: 'checking' });

        // 처리 중에는 스캐너를 멈춰 같은 QR의 중복 요청을 막는다.

        try { html5QrRef.current?.pause(false); } catch { /* 이미 멈춰 있으면 무시 */ }

        try {
            // 체크인은 승인 상태와 독립된 멱등 출석 기록이다.
            if (decodedText.startsWith('rw1.j.')) {
                throw new Error('현장 접수용 QR이에요. 호출 후 받은 입장 QR을 비춰주세요.');
            }
            const result = isWaiting ? await waitingService.checkInByQr(decodedText)
                : await reservationService.checkInByQr(decodedText);
            if (html5QrRef.current !== scanner) return;
            const { alreadyCheckedIn } = result;
            setScanResult({ kind, state: alreadyCheckedIn ? 'duplicate' : 'success', data: isWaiting ? result.entry : result.reservation });
            const who = isWaiting ? `${result.entry.entryNumber}번` : `${result.reservation.memberName || '고객'}님`;
            if (alreadyCheckedIn) {
                message.info(`${who}은 이미 체크인됐어요.`);
            } else {
                message.success(`${who} 체크인이 완료됐어요.`);
                // 예약 관리 목록은 이 탭(또는 시트)으로 오면서 가려졌지만 캐시는 남아 있다.
                // 무효화하지 않으면 돌아갔을 때 상세 모달에 체크인 시각이 빠진 목록이 보인다.
                if (isWaiting) void queryClient.invalidateQueries({ queryKey: ['waiting'] });
                else void invalidateReservationData(queryClient);
            }
        } catch (err) {
            if (html5QrRef.current !== scanner || err?.isStaleSession || err?.isSessionExpired) return;
            setScanResult({ kind, state: 'error', error: err });
            message.error(err?.message || 'QR 체크인에 실패했어요.');
        } finally {
            // 2초 텀을 두고 다시 스캔 허용 (같은 QR 연속 인식 방지)
            if (html5QrRef.current === scanner) {
                clearTimeout(resumeTimerRef.current);
                resumeTimerRef.current = setTimeout(() => {
                    if (html5QrRef.current !== scanner) return;
                    processingRef.current = false;
                    setProcessing(false);
                    try { scanner.resume(); } catch { /* 이미 중지됐으면 무시 */ }
                }, 2000);
            }
        }
    }, [message, queryClient]);

    /*
     * 영상 해상도는 start 완료 직후 0일 수 있어 loadedmetadata·resize에서 확인한다. 보정 재시작은 상한을 둔다.
     */
    const attachAspectWatcher = useCallback(() => {
        aspectWatcherCleanupRef.current?.();
        aspectWatcherCleanupRef.current = null;

        const videoEl = document.getElementById(SCANNER_ELEMENT_ID)?.querySelector('video');
        if (!videoEl) return;

        const measure = () => {
            const w = videoEl.videoWidth;
            const h = videoEl.videoHeight;
            if (!w || !h) return;

            const actual = w / h;
            const drift = Math.abs(actual - decodeAspectRef.current) / actual;
            if (drift <= ASPECT_TOLERANCE) return;
            if (aspectFixCountRef.current >= MAX_ASPECT_FIXES) {
                console.warn(`[QR] aspect still drifting after ${MAX_ASPECT_FIXES} fixes - giving up`);
                return;
            }

            console.warn(
                `[QR] aspect mismatch: camera ${w}x${h} (${actual.toFixed(3)}) vs decode canvas `
                + `${decodeAspectRef.current.toFixed(3)} - resizing container and restarting`
            );
            aspectFixCountRef.current += 1;
            decodeAspectRef.current = actual;
            restartForAspectRef.current = true;
            // 컨테이너가 새 높이로 다시 그려진 뒤에 재시작해야 한다 → 아래 useEffect 가 처리.
            setDecodeAspect(actual);
        };

        measure();  // 이미 메타데이터가 온 뒤일 수도 있다
        videoEl.addEventListener('loadedmetadata', measure);
        videoEl.addEventListener('resize', measure);
        aspectWatcherCleanupRef.current = () => {
            videoEl.removeEventListener('loadedmetadata', measure);
            videoEl.removeEventListener('resize', measure);
        };
    }, []);

    const startScanning = useCallback(async () => {
        if (startBusyRef.current) return;
        if (window.isSecureContext === false || typeof navigator.mediaDevices?.getUserMedia !== 'function') {
            const presentation = unsupportedCameraPresentation();
            setErrorIcon(presentation.icon);
            setErrorMsg(presentation.message);
            setStatus('error');
            return;
        }
        setStatus('starting');
        startBusyRef.current = true;
        const generation = ++scanGenerationRef.current;
        clearTimeout(decodeCheckTimerRef.current);
        setErrorMsg('');
        setScanResult(null);
        setProcessing(false);
        processingRef.current = false;
        clearTimeout(resumeTimerRef.current);
        lastDecodedRef.current = null;
        consecutiveMissesRef.current = 0;
        decodeTickRef.current = 0;

        // 이전 인스턴스가 남아 있으면 반드시 정리하고 시작한다 — start()가 컨테이너를
        // clearElement()로 비워버리기 때문에, 정리하지 않으면 이전 인스턴스의 스캔 루프와
        // 카메라 트랙이 DOM에서 떨어진 채로 계속 살아 있게 된다("다시 시도"를 누를 때 발생).
        const previous = html5QrRef.current;
        if (previous) {
            html5QrRef.current = null;
            await stopCamera(previous);
        }

        try {
            if (generation !== scanGenerationRef.current) return;
            const html5Qr = new Html5Qrcode(SCANNER_ELEMENT_ID);
            html5QrRef.current = html5Qr;
            // 프레임 전체를 디코딩하며 안내선은 화면 표시로만 사용한다.

            const startup = html5Qr.start(
                { facingMode: 'environment' },
                {
                    fps: 10,

                    // 기본 요청 비율은 선호값이며 실제 카메라 비율은 별도로 확인한다.

                    videoConstraints: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 720 },
                    },
                    // 프레임 반전 재해독은 사용하지 않아 중복 디코딩 비용을 줄인다.

                    disableFlip: true,
                },
                decodedText => {
                    if (generation === scanGenerationRef.current && html5QrRef.current === html5Qr) return handleScanSuccess(decodedText);
                },
                () => {
                    if (generation !== scanGenerationRef.current || html5QrRef.current !== html5Qr) return;

                    // 디코딩 오류 콜백은 루프가 계속 실행되는 신호로도 사용한다.

                    decodeTickRef.current += 1;
                    // QR이 화면을 벗어난 뒤에만 중복 인식 잠금을 해제한다.
                    consecutiveMissesRef.current += 1;
                    if (consecutiveMissesRef.current >= 5) lastDecodedRef.current = null;
                }
            );
            trackStartup(html5Qr, startup);
            await startup;
            if (generation !== scanGenerationRef.current || html5QrRef.current !== html5Qr) return;

            setStatus('scanning');

            // 영상 메타데이터 확정 전에는 videoWidth를 사용하지 않는다.

            attachAspectWatcher();

            // 루프가 정말 도는지 확인한다. 1.5초면 fps 10 기준 10회 이상 들어와야 한다.
            decodeCheckTimerRef.current = setTimeout(() => {
                if (html5QrRef.current === html5Qr && decodeTickRef.current === 0) {
                    console.warn('[QR] decode loop did not start (no error-callback ticks)');
                }
            }, 1500);
        } catch (err) {
            if (generation !== scanGenerationRef.current) return;
            console.warn('[QR] camera start unavailable');
            setStatus('error');
            const presentation = cameraFailurePresentation(err);
            setErrorIcon(presentation.icon);
            setErrorMsg(presentation.message);
        } finally {
            startBusyRef.current = false;
        }
    }, [handleScanSuccess, attachAspectWatcher, stopCamera, trackStartup]);

    // 종횡비 보정 뒤 재시작 — decodeAspect 가 반영돼 컨테이너가 새 높이로 그려진 다음에 돈다.
    // 플래그가 없으면 마운트 시점과 startScanning 재생성 시점에도 카메라가 켜져버린다.
    useEffect(() => {
        if (!restartForAspectRef.current) return;
        restartForAspectRef.current = false;
        void startScanning();
    }, [decodeAspect, startScanning]);

    // 시작 완료가 늦어도 종료 처리기가 카메라를 정리할 수 있게 한다.

    const stopScanning = useCallback(async () => {
        const generation = ++scanGenerationRef.current;
        clearTimeout(decodeCheckTimerRef.current);
        aspectWatcherCleanupRef.current?.();
        aspectWatcherCleanupRef.current = null;
        clearTimeout(resumeTimerRef.current);
        processingRef.current = false;
        setProcessing(false);
        setScanResult(result => result?.state === 'checking' ? null : result);
        const scanner = html5QrRef.current;
        html5QrRef.current = null;
        await stopCamera(scanner);
        if (generation === scanGenerationRef.current) setStatus('idle');
    }, [stopCamera]);

    // 컴포넌트가 언마운트될 때(다른 탭으로 이동 등) 카메라를 반드시 끔
    useEffect(() => () => {
        scanGenerationRef.current += 1;
        clearTimeout(decodeCheckTimerRef.current);
        aspectWatcherCleanupRef.current?.();
        aspectWatcherCleanupRef.current = null;
        clearTimeout(resumeTimerRef.current);
        const scanner = html5QrRef.current;
        html5QrRef.current = null;
        void stopCamera(scanner);
    }, [stopCamera]);

    // 탭 마운트 직후 짧게 보여주는 카드 모양 skeleton (위 ready 관련 주석 참고)
    if (!ready) {
        return (
            <LoadingStatus
                className="reserve-qr-scanner"
                style={styles.wrapper}
                aria-label="QR 스캐너를 준비하는 중"
                aria-busy="true"
            >
                <div style={{ ...styles.card, ...(sheet ? styles.sheetCard : {}) }}>
                    <Bone width={90} height={18} style={{ marginBottom: 8 }} />
                    <Bone width="85%" height={13} style={{ marginBottom: 16 }} />
                    {/* 프리뷰 박스와 같은 비율이어야 스켈레톤이 사라질 때 카드 높이가 안 튄다 */}
                    <Bone width="100%" height="auto" borderRadius={radius.xl}
                        style={{ aspectRatio: `${DECODE_WIDTH} / ${decodeHeight}` }} />
                </div>
            </LoadingStatus>
        );
    }

    return (
        <div className="reserve-qr-scanner" style={styles.wrapper}>
            <div style={{ ...styles.card, ...(sheet ? styles.sheetCard : {}) }}>
                {!sheet && <Text strong style={styles.cardTitle}>QR 체크인</Text>}
                <Text type="secondary" style={styles.hint}>
                    예약·웨이팅 QR을 비추면 입장 기록을 확인해요.
                </Text>

                {/* 스캐너 프리뷰 박스 — 항상 렌더링(display:none 금지), 오버레이만 상태별로 전환.
                    비율은 카메라가 실제로 주는 값을 따라간다(고정 4:3 아님 — 상단 종횡비 주석). */}
                <div
                    style={{ ...styles.previewBox, aspectRatio: `${DECODE_WIDTH} / ${decodeHeight}` }}
                    ref={previewRef}
                >
                    {/* 레이아웃 크기는 720 x (720/카메라비율) 고정, 보이는 크기만 transform으로 줄인다.
                        (이 div의 clientWidth/clientHeight가 그대로 디코딩 캔버스 크기가 된다) */}
                    <div
                        id={SCANNER_ELEMENT_ID}
                        style={{ ...styles.scannerFill, height: decodeHeight, transform: `scale(${previewScale})` }}
                    />

                    {/*
                     * 안내선은 장식이며 실제 스캔 영역을 제한하지 않는다.
                     */}
                    {status === 'scanning' && (
                        <QrTrackingGuide previewRef={previewRef} active={!processing} aspect={decodeAspect} />
                    )}

                    {status !== 'scanning' && (
                        <div style={styles.overlay}>
                            {status === 'idle' && (
                                <>
                                    <StateIllustration name="qr-ready" size="sm" />
                                    <Text strong style={styles.overlayTitle}>카메라를 켜고 스캔을 시작하세요</Text>
                                    {!sheet && (
                                        <Button variant="primary" size="sm" onClick={startScanning}>
                                            QR 스캔 시작
                                        </Button>
                                    )}
                                </>
                            )}
                            {/*
                             * 카메라 준비는 공통 골격으로 표시한다.
                             */}
                            {status === 'starting' && (
                                <>
                                    <Bone width="100%" height="100%" borderRadius={0} style={{ position: 'absolute', inset: 0 }} />
                                    <Text type="secondary" style={{ fontSize: fontSize.sm, position: 'relative' }}>카메라를 준비하고 있어요…</Text>
                                </>
                            )}
                            {status === 'error' && (
                                <>
                                    <StateIllustration name={errorIcon} size="sm" />
                                    <Text style={{ color: colors.error.main, textAlign: 'center', padding: '0 20px', fontSize: fontSize.sm }}>
                                        {errorMsg}
                                    </Text>
                                    {!sheet && (
                                        <Button variant="secondary" size="sm" onClick={startScanning}>
                                            다시 시도
                                        </Button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

                {status === 'scanning' && (
                    <div style={styles.scanningFooter}>
                        <span className="reserve-qr-scanning-dot" style={styles.scanningDot} />
                        <Text style={{ fontSize: fontSize.sm, color: colors.text.secondary, flex: 1 }}>
                            {scanResult?.state === 'checking' ? '체크인을 확인하고 있어요…' : processing ? '다음 QR을 준비해주세요.' : '스캔 대기 중…'}
                        </Text>
                    </div>
                )}

                <QrScanResult result={scanResult} />

                {/*
                 * 진단 화면에서 영상·캔버스 비율과 디코딩 반복 여부를 구분한다.
                 */}
                {debugOn && debugInfo && (
                    <div style={styles.debugPanel}>
                        <div>native <b>{debugInfo.native}</b> ({debugInfo.nativeAspect})</div>
                        <div>canvas <b>{debugInfo.canvas}</b> ({debugInfo.canvasAspect})</div>
                        <div style={{ color: debugInfo.nativeAspect === debugInfo.canvasAspect ? colors.success.main : colors.error.main }}>
                            {debugInfo.nativeAspect === debugInfo.canvasAspect ? '비율 일치 — 왜곡 없음' : '⚠ 비율 불일치 — 프레임 눌림'}
                        </div>
                        <div>ticks {debugInfo.ticks} · 보정 {debugInfo.fixes}회</div>
                    </div>
                )}

                {sheet && (
                    <div className="reserve-qr-scanner-actions">
                        <Button variant="secondary" size="md" onClick={onClose}>닫기</Button>
                        <Button
                            variant="primary"
                            size="md"
                            onClick={status === 'scanning' ? stopScanning : startScanning}
                            loading={status === 'starting'}
                        >
                            {status === 'scanning' && '스캔 중지'}
                            {status === 'error' && '다시 시도'}
                            {(status === 'idle' || status === 'starting') && 'QR 스캔 시작'}
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
};

const styles = {
    wrapper: { maxWidth: 420, margin: '0 auto', paddingTop: 16, paddingBottom: 40, display: 'flex', flexDirection: 'column', gap: 16 },
    card: {
        background: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius['2xl'],
        boxShadow: shadows.card,
        padding: 20,
    },
    sheetCard: { background: 'transparent', border: 'none', borderRadius: 0, boxShadow: 'none', padding: 0 },
    cardTitle: { display: 'block', fontSize: fontSize.base, color: colors.text.primary, marginBottom: 4 },
    hint:     { display: 'block', marginBottom: 16, fontSize: fontSize.sm, lineHeight: 1.5 },
    // qrdebug=1일 때만 카메라 진단값을 표시한다.
    previewBox: {
        position: 'relative',
        width: '100%',
        borderRadius: radius.xl,
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
        backgroundColor: colors.gray[100],
    },
    // height 도 렌더에서 덮는다(카메라 비율에서 유도).
    scannerFill: {
        width: DECODE_WIDTH,
        transformOrigin: 'top left',
        position: 'absolute',
        top: 0,
        left: 0,
    },
    overlay: {
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        backgroundColor: colors.gray[50],
    },
    overlayTitle: { fontSize: fontSize.sm, color: colors.text.primary },
    scanningFooter: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 12,
        padding: '10px 0',
    },
    scanningDot: {
        display: 'block', width: 8, height: 8, borderRadius: '50%',
        backgroundColor: colors.success.main, flexShrink: 0,
        animation: 'reserve-qr-pulse 1.4s ease-out infinite',
    },
    debugPanel: {
        marginTop: 10,
        padding: '10px 12px',
        borderRadius: radius.lg,
        backgroundColor: colors.gray[50],
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: fontSize.xs,
        lineHeight: 1.6,
        color: colors.text.secondary,
    },
};

QrScannerTab.propTypes = {
    sheet: PropTypes.bool,
    onClose: PropTypes.func,
};

export default QrScannerTab;
