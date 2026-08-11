import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Typography } from 'antd';
import { CheckCircleFilled, ReloadOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { Button, Bone } from '../common';
import reservationService from '../../services/reservationService';
import { useMessage } from '../../hooks';
import { colors, radius, shadows, fontSize, fontWeight, withAlpha } from '../../styles/tokens';

const { Text } = Typography;
const SCANNER_ELEMENT_ID = 'qr-checkin-scanner';

// ★★ 디코딩 해상도 (2026-08-09) — QR이 아예 안 읽히던 원인이자 그 해결책이다.
//
// html5-qrcode는 디코딩용 캔버스를 <video>의 **레이아웃 CSS 픽셀**(clientWidth/Height)로 만들고,
// 카메라 프레임 전체를 그 캔버스로 축소해서 ZXing에 넘긴다(esm/html5-qrcode.js:484-545, 553-575).
// DPR 보정도 없다. 즉 카메라가 1280이든 4K든 **디코더가 보는 건 컨테이너 CSS 폭이 전부**다.
// 390px 폰에서 프리뷰 박스는 약 302px이었고, 그러면 모듈당 1.3px 수준이라 ZXing 하한(약 2px)에
// 못 미쳐 영원히 못 읽는다. 폰 기본 카메라 앱은 센서 원본을 읽으니 같은 QR이 잘 읽혔다.
//
// transform: scale()은 페인트 단계라 clientWidth를 바꾸지 않는다. 그래서 <video>를 CSS상
// 720x540으로 두고 화면에서만 축소해 보여주면, 보이는 크기는 그대로인데 디코딩 캔버스만 720이 된다.
// 실측 시뮬레이션(합성 프레임 → 캔버스 축소 → jsQR): 캔버스 302에선 10cm에서도 실패,
// 캔버스 720에선 10~20cm에서 인식. 값을 줄이면 그만큼 인식 거리가 짧아진다.
const DECODE_WIDTH = 720;
const DECODE_HEIGHT = 540;                 // 4:3 — videoConstraints와 비율을 맞춰 왜곡을 없앤다
const DEFAULT_PREVIEW_SCALE = 302 / DECODE_WIDTH;

// 라이브러리가 넣는 <video>가 컨테이너를 정확히 꽉 채우도록 강제 (검은 여백/크롭 방지) +
// 스캔 대기 dot의 pulse 링 애니메이션 (2026-07 리디자인 — App.jsx 전역 keyframes와 동일한
// 로컬 <style> 태그 패턴, 이 컴포넌트에서만 쓰는 애니메이션이라 전역에 안 얹고 여기 둠)
const scannerVideoStyles = `
  #${SCANNER_ELEMENT_ID} video {
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
  }
  @keyframes reserve-qr-pulse {
    0%   { box-shadow: 0 0 0 0 ${colors.success.main}55; }
    100% { box-shadow: 0 0 0 8px ${colors.success.main}00; }
  }
`;

/**
 * QR 체크인 스캐너 (사업자용)
 *
 * html5-qrcode의 저수준 Html5Qrcode API를 사용 — Html5QrcodeScanner(자동 UI 생성 버전)는
 * 라이브러리 기본 스타일이 그대로 노출되어 우리 디자인 시스템과 안 맞았고, 카메라 시작/중지
 * 버튼과 프리뷰 컨테이너를 전부 우리 Button으로 직접 그림. QR 이미지 자체는 어디에도 저장되지
 * 않고 카메라 프레임에서 바로 디코딩됨.
 *
 * [중요 - 카메라 화면 안 보이던 버그] 스캐너를 붙일 div(#qr-checkin-scanner)는 항상 렌더링된
 * 상태(display:none 금지)를 유지해야 함 — Html5Qrcode가 시작 시점에 컨테이너의 실제 너비/높이를
 * 읽어서 비디오 크기를 잡는데, display:none이면 0×0으로 계산됨(2026-07-07 발견, 수정함).
 *
 * [중요 - 크롭/검은 여백 문제] qrbox 가이드 프레임(흰 모서리 박스)을 넣었더니 비디오가 박스
 * 하단에서 잘려 보이고 빈 공간이 검게 남는 문제가 있었음 → qrbox 설정을 없애고 비디오가 카메라
 * 프레임 전체를 그대로(자르지 않고) 채우도록 정리함. 컨테이너 비율도 1:1 정사각형 대신 일반
 * 웹캠 비율인 4:3으로 맞춰서 여백이 거의 안 생기게 함.
 * (2026-07 리디자인 — 모서리 브라켓은 html5-qrcode의 qrbox 옵션이 아니라 순수 CSS 오버레이로
 * 다시 추가했다. 실제 디코딩 영역(=카메라 프레임 전체)에는 전혀 관여하지 않는 장식 요소라
 * 위 크롭 버그와는 무관하다.)
 *
 * [중요 - 탭 전환해도 카메라 안 꺼지던 버그] BusinessPanel의 Tabs에 destroyInactiveTabPane을
 * 켜서, 다른 탭으로 이동하면 이 컴포넌트가 언마운트되고 아래 cleanup useEffect가 카메라를 끔.
 */
const QrScannerTab = () => {
    const { message } = useMessage();
    const html5QrRef = useRef(null);
    // 같은 프레임에서 같은 QR이 연속으로 감지되어 중복 요청되는 것을 막는 락
    const processingRef = useRef(false);

    const [status, setStatus] = useState('idle'); // idle | starting | scanning | error
    const [errorMsg, setErrorMsg] = useState('');
    const [lastResult, setLastResult] = useState(null);

    // 디코딩 루프가 실제로 도는지 확인하는 유일한 신호 (아래 startScanning 주석 참고)
    const decodeTickRef = useRef(0);
    const resumeTimerRef = useRef(null);
    const previewRef = useRef(null);
    const [previewScale, setPreviewScale] = useState(DEFAULT_PREVIEW_SCALE);

    // 2026-07 추가: 다른 탭(예약 관리 등)은 다 서버 데이터 로딩 스켈레톤이 있는데 이 탭만
    // 없어서 이질적으로 보였다. 카메라 상태(idle/starting/scanning)는 서버 데이터가 아니라
    // 로컬 상태라 원래 기다릴 게 없지만, BusinessPanel Tabs가 destroyOnHidden이라 이 탭으로
    // 올 때마다 컴포넌트가 매번 새로 마운트되므로, 짧게라도 카드 모양 그대로의 shimmer
    // 스켈레톤을 한 번 보여줘서 다른 탭들과 같은 로딩 언어를 쓰게 한다.
    const [ready, setReady] = useState(false);
    useEffect(() => {
        const t = setTimeout(() => setReady(true), 400);
        return () => clearTimeout(t);
    }, []);

    // 고정 720x540 스캐너 영역을 실제 프리뷰 박스 폭에 맞춰 시각적으로만 축소한다.
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

    const handleScanSuccess = useCallback(async (decodedText) => {
        if (processingRef.current) return;
        processingRef.current = true;

        // 스캐너를 잠시 멈춘다 (2026-08-09). 예전엔 루프가 계속 돌아서 QR이 화면에 남아 있는 동안
        // 2초마다 체크인 API를 다시 호출했다 — 성공 토스트가 무한히 다시 뜨고 요청도 계속 나갔다.
        try { html5QrRef.current?.pause(false); } catch { /* 이미 멈춰 있으면 무시 */ }

        try {
            const reservation = await reservationService.checkInByQr(decodedText);
            setLastResult(reservation);
            message.success(`${reservation.memberName || '고객'}님 예약이 체크인됐습니다.`);
        } catch (err) {
            message.error(err?.message || 'QR 체크인에 실패했습니다.');
        } finally {
            // 2초 텀을 두고 다시 스캔 허용 (같은 QR 연속 인식 방지)
            clearTimeout(resumeTimerRef.current);
            resumeTimerRef.current = setTimeout(() => {
                processingRef.current = false;
                try { html5QrRef.current?.resume(); } catch { /* 이미 중지됐으면 무시 */ }
            }, 2000);
        }
    }, [message]);

    const startScanning = useCallback(async () => {
        setStatus('starting');
        setErrorMsg('');
        decodeTickRef.current = 0;

        // 이전 인스턴스가 남아 있으면 반드시 정리하고 시작한다 — start()가 컨테이너를
        // clearElement()로 비워버리기 때문에, 정리하지 않으면 이전 인스턴스의 스캔 루프와
        // 카메라 트랙이 DOM에서 떨어진 채로 계속 살아 있게 된다("다시 시도"를 누를 때 발생).
        const previous = html5QrRef.current;
        if (previous) {
            html5QrRef.current = null;
            try { await previous.stop(); } catch { /* 이미 멈춰 있으면 무시 */ }
        }

        try {
            const html5Qr = new Html5Qrcode(SCANNER_ELEMENT_ID);
            html5QrRef.current = html5Qr;
            // qrbox는 여전히 주지 않는다 — 프레임 전체를 스캔 영역으로 쓴다.
            // (예전에 qrbox를 넣었다가 비디오가 잘려 보이고 검은 여백이 생겼던 이력이 있다.
            //  해상도는 qrbox가 아니라 위 DECODE_WIDTH 방식으로 해결한다.)
            await html5Qr.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    // videoConstraints가 있으면 첫 인자 대신 이 값이 쓰인다(내부 areVideoConstraintsEnabled).
                    // 4:3으로 요청해 DECODE_WIDTH/HEIGHT 비율과 맞춘다 — 16:9가 오면 드로잉 단계에서
                    // 프레임이 4:3으로 눌려 모듈이 정사각형이 아니게 되고 인식률이 떨어진다.
                    videoConstraints: {
                        facingMode: 'environment',
                        width: { ideal: 1280 },
                        height: { ideal: 960 },
                    },
                    // 미설정이면 라이브러리가 실패한 프레임마다 캔버스를 좌우반전해서 한 번 더 디코딩하는데,
                    // 변환을 원복하지 않아 그 다음 프레임까지 반전된 상태로 그려진다. 결과적으로 절반의
                    // 프레임이 버려진다. QR은 반전되면 못 읽으므로 끄는 쪽이 항상 이득이다.
                    disableFlip: true,
                },
                handleScanSuccess,
                () => {
                    // 이 콜백은 "이번 프레임에서 QR을 못 찾음"으로 초당 10회 호출된다.
                    // 예전엔 빈 함수라 통째로 버렸는데, 이게 **디코딩 루프가 살아 있다는 유일한 신호**다.
                    // start()의 Promise는 video.play()를 부른 직후 resolve되고, 실제 스캔 루프는
                    // 그 뒤 'playing' 이벤트 핸들러에서 만들어진다. 그래서 루프가 안 떠도
                    // "스캔 대기 중…"이 그대로 보이는 상태가 가능했다.
                    decodeTickRef.current += 1;
                }
            );

            setStatus('scanning');

            // 루프가 정말 도는지 확인한다. 1.5초면 fps 10 기준 10회 이상 들어와야 한다.
            setTimeout(() => {
                if (html5QrRef.current === html5Qr && decodeTickRef.current === 0) {
                    console.warn('[QR] decode loop did not start (no error-callback ticks)');
                }
            }, 1500);
        } catch (err) {
            console.error('[QR] camera start failed', err);
            setStatus('error');
            const name = err?.name || '';
            if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
                setErrorMsg('카메라 권한이 거부됐습니다. 브라우저 설정에서 허용해주세요.');
            } else if (name === 'NotReadableError' || name === 'TrackStartError') {
                setErrorMsg('다른 앱이 카메라를 쓰고 있습니다. 해당 앱을 닫고 다시 시도해주세요.');
            } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
                setErrorMsg('사용할 수 있는 후면 카메라를 찾지 못했습니다.');
            } else {
                setErrorMsg('카메라를 시작할 수 없습니다. 브라우저 카메라 권한을 확인해주세요.');
            }
        }
    }, [handleScanSuccess]);

    // ★ isScanning으로 가드하지 않는다 (2026-08-09).
    //   isScanning은 'playing' 이벤트 핸들러 안에서야 true가 된다. 카메라가 켜지는 도중에
    //   탭을 옮기면 이 값이 false여서 stop()을 건너뛰었고, 컴포넌트는 사라졌는데 카메라
    //   트랙만 살아남았다(녹색 표시등이 계속 켜져 있는 상태). 무조건 stop()을 부르고
    //   "이미 멈춰 있음" 예외는 삼킨다.
    const stopScanning = useCallback(async () => {
        clearTimeout(resumeTimerRef.current);
        processingRef.current = false;
        const scanner = html5QrRef.current;
        html5QrRef.current = null;
        if (scanner) {
            try { await scanner.stop(); } catch { /* 아직 시작 전이거나 이미 멈춤 */ }
        }
        setStatus('idle');
        setLastResult(null);
    }, []);

    // 컴포넌트가 언마운트될 때(다른 탭으로 이동 등) 카메라를 반드시 끔
    useEffect(() => () => {
        clearTimeout(resumeTimerRef.current);
        const scanner = html5QrRef.current;
        html5QrRef.current = null;
        if (scanner) {
            Promise.resolve()
                .then(() => scanner.stop())
                .catch(() => {});
        }
    }, []);

    // 탭 마운트 직후 짧게 보여주는 카드 모양 skeleton (위 ready 관련 주석 참고)
    if (!ready) {
        return (
            <div style={styles.wrapper}>
                <div style={styles.card}>
                    <Bone width={90} height={18} style={{ marginBottom: 8 }} />
                    <Bone width="85%" height={13} style={{ marginBottom: 16 }} />
                    <Bone width="100%" height="auto" borderRadius={radius.xl} style={{ aspectRatio: '4 / 3' }} />
                </div>
            </div>
        );
    }

    return (
        <div style={styles.wrapper}>
            <style>{scannerVideoStyles}</style>

            <div style={styles.card}>
                <Text strong style={styles.cardTitle}>QR 체크인</Text>
                <Text type="secondary" style={styles.hint}>
                    고객의 예약 QR을 카메라로 비추면 자동으로 체크인(승인)됩니다.
                </Text>

                {/* 스캐너 프리뷰 박스 — 항상 렌더링(display:none 금지), 오버레이만 상태별로 전환 */}
                <div style={styles.previewBox} ref={previewRef}>
                    {/* 레이아웃 크기는 720x540 고정, 보이는 크기만 transform으로 줄인다.
                        (이 div의 clientWidth가 그대로 디코딩 캔버스 크기가 된다) */}
                    <div
                        id={SCANNER_ELEMENT_ID}
                        style={{ ...styles.scannerFill, transform: `scale(${previewScale})` }}
                    />

                    {/* 스캔 중에만 보이는 모서리 브라켓 가이드 — 순수 장식, 실제 스캔 영역과 무관 */}
                    {status === 'scanning' && (
                        <div style={styles.bracketFrame}>
                            <span style={{ ...styles.corner, top: 14, left: 14, borderRight: 'none', borderBottom: 'none' }} />
                            <span style={{ ...styles.corner, top: 14, right: 14, borderLeft: 'none', borderBottom: 'none' }} />
                            <span style={{ ...styles.corner, bottom: 14, left: 14, borderRight: 'none', borderTop: 'none' }} />
                            <span style={{ ...styles.corner, bottom: 14, right: 14, borderLeft: 'none', borderTop: 'none' }} />
                        </div>
                    )}

                    {status !== 'scanning' && (
                        <div style={styles.overlay}>
                            {status === 'idle' && (
                                <>
                                    <Text strong style={styles.overlayTitle}>카메라를 켜고 스캔을 시작하세요</Text>
                                    <Button variant="primary" size="sm" onClick={startScanning}>
                                        QR 스캔 시작
                                    </Button>
                                </>
                            )}
                            {/* 2026-07: 순수 CSS 스피너 링 대신 앱 전체가 쓰는 shimmer Bone 스켈레톤으로 통일 —
                                다른 로딩 화면(예약 목록 등)과 같은 로딩 언어를 쓰도록. 실제 서버 데이터를
                                기다리는 건 아니지만(카메라 시작은 클라이언트 로컬 작업), 사용자 입장에선
                                '뭔가 준비되는 중'이라는 신호는 동일하게 필요하다. */}
                            {status === 'starting' && (
                                <>
                                    <Bone width="100%" height="100%" borderRadius={0} style={{ position: 'absolute', inset: 0 }} />
                                    <Text type="secondary" style={{ fontSize: fontSize.sm, position: 'relative' }}>카메라를 준비하고 있어요…</Text>
                                </>
                            )}
                            {status === 'error' && (
                                <>
                                    <div style={{ ...styles.iconBadge, background: withAlpha(colors.error.main), color: colors.error.main }}>
                                        <ExclamationCircleOutlined style={{ fontSize: 26 }} />
                                    </div>
                                    <Text style={{ color: colors.error.main, textAlign: 'center', padding: '0 20px', fontSize: fontSize.sm }}>
                                        {errorMsg}
                                    </Text>
                                    <Button variant="secondary" size="sm" onClick={startScanning}>
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
            </div>

            {lastResult && (
                <div style={styles.resultCard}>
                    <div style={styles.resultIconBadge}>
                        <CheckCircleFilled style={{ fontSize: 30, color: '#fff' }} />
                    </div>
                    <Text strong style={styles.resultTitle}>
                        {lastResult.memberName || '고객'}님 체크인 완료
                    </Text>
                    <Text type="secondary" style={{ fontSize: fontSize.sm }}>
                        {lastResult.reservationDate} {lastResult.reservationTime?.substring(0, 5) || ''} · {lastResult.guestCount}명
                    </Text>
                </div>
            )}
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
    cardTitle: { display: 'block', fontSize: fontSize.base, color: colors.text.primary, marginBottom: 4 },
    hint:     { display: 'block', marginBottom: 16, fontSize: fontSize.sm, lineHeight: 1.5 },
    previewBox: {
        position: 'relative',
        width: '100%',
        aspectRatio: '4 / 3',
        borderRadius: radius.xl,
        overflow: 'hidden',
        border: `1px solid ${colors.border.light}`,
        backgroundColor: colors.gray[100],
    },
    scannerFill: {
        width: DECODE_WIDTH,
        height: DECODE_HEIGHT,
        transformOrigin: 'top left',
        position: 'absolute',
        top: 0,
        left: 0,
    },
    bracketFrame: { position: 'absolute', inset: 0, pointerEvents: 'none' },
    corner: {
        position: 'absolute',
        width: 28,
        height: 28,
        border: '3px solid rgba(255,255,255,0.9)',
        borderRadius: 4,
        filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.35))',
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
    iconBadge: {
        width: 60,
        height: 60,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: withAlpha(colors.primary.main),
        color: colors.primary.main,
    },
    overlayTitle: { fontSize: fontSize.sm, color: colors.text.primary },
    scanningFooter: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginTop: 12,
        padding: '10px 14px',
        borderRadius: radius.lg,
        backgroundColor: colors.gray[50],
    },
    scanningDot: {
        display: 'block', width: 8, height: 8, borderRadius: '50%',
        backgroundColor: colors.success.main, flexShrink: 0,
        animation: 'reserve-qr-pulse 1.4s ease-out infinite',
    },
    resultCard: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        textAlign: 'center',
        background: colors.background.paper,
        border: `1px solid ${colors.border.light}`,
        borderRadius: radius['2xl'],
        boxShadow: shadows.card,
        padding: '28px 20px',
    },
    resultIconBadge: {
        width: 64, height: 64, borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: colors.success.main,
        marginBottom: 4,
    },
    resultTitle: { fontSize: fontSize.base, color: colors.text.primary, fontWeight: fontWeight.bold },
};

export default QrScannerTab;
