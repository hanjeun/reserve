import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ConfigProvider, App as AntApp, QRCode } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { Html5Qrcode } from 'html5-qrcode';
import QrScannerSheet from '../src/components/reservation/QrScannerSheet';
import QrScanResult from '../src/components/reservation/QrScanResult';
import reservationService from '../src/services/reservationService';
import waitingService from '../src/services/waitingService';
import useAuthStore from '../src/store/useAuthStore';
import { QR_PREVIEW_CASES } from './qr-checkin-fixtures';
import '../src/index.css';

if (!import.meta.env.DEV) throw new Error('QR preview is development-only');
const scenario = new URLSearchParams(window.location.search).get('case') || 'reservation-success';
const fixture = QR_PREVIEW_CASES.find(item => item.key === scenario);
document.documentElement.dataset.theme = 'light';
useAuthStore.setState({ user: { id: 1, role: 'BUSINESS', name: '미리보기' }, isLoggedIn: true });
const diagnostics = { serviceCalls: 0, trackingFrames: 0, cameraFramesUploaded: 0 };
window.__qrPreviewDiagnostics = diagnostics;
window.__qrPreviewCases = QR_PREVIEW_CASES.map(({ key, label }) => ({ key, label }));

const mockCheckin = async () => {
    diagnostics.serviceCalls += 1;
    if (fixture.pending) return new Promise(() => {});
    await new Promise(resolve => setTimeout(resolve, 180));
    if (fixture.error) throw Object.assign(new Error(fixture.error.message), { status: fixture.error.status });
    return fixture.response;
};
reservationService.checkInByQr = mockCheckin;
waitingService.checkInByQr = mockCheckin;

// Only this isolated entry replaces the camera. Never imports into the production app.
Html5Qrcode.prototype.start = async function (_camera, _config, success, failure) {
    if (fixture.cameraError) throw new DOMException('Example camera failure', fixture.cameraError);
    if (fixture.starting) return new Promise(() => {});
    const surface = document.getElementById('qr-checkin-scanner');
    this.previewSurface = surface;
    const video = document.createElement('video');
    Object.defineProperties(video, { videoWidth: { value: 1280 }, videoHeight: { value: 720 }, readyState: { value: 4 } });
    video.style.cssText = 'display:block;width:720px;height:405px;background:linear-gradient(145deg,#d8e2ed,#8ea4bb);';
    surface.append(video);
    const qr = document.createElement('div');
    qr.style.cssText = 'position:absolute;left:190px;top:90px;padding:8px;background:white;border-radius:8px;';
    surface.append(qr);
    this.previewQr = qr;
    this.previewRoot = createRoot(qr);
    this.previewRoot.render(<QRCode value="PREVIEW-NOT-A-VALID-CHECKIN" size={146} bordered={false} />);
    let sent = false;
    this.previewLoop = setInterval(() => {
        if (this.previewPaused) return;
        if (fixture.noScan) { failure('Example frame without decoded result'); return; }
        if (!sent || scenario !== 'checking') {
            sent = true;
            void success(fixture.token || (fixture.kind === 'waiting' ? 'rw1.e.PREVIEW-ONLY' : 'PREVIEW-ONLY'));
        }
    }, 100);
};
Html5Qrcode.prototype.pause = function () { this.previewPaused = true; };
Html5Qrcode.prototype.resume = function () { this.previewPaused = false; };
Html5Qrcode.prototype.stop = async function () {
    clearInterval(this.previewLoop);
    this.previewRoot?.unmount();
    this.previewSurface?.replaceChildren();
};
if (fixture?.tracking) Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: class {
    static async getSupportedFormats() { return ['qr_code']; }
    async detect() {
        diagnostics.trackingFrames += 1;
        const x = 340 + Math.sin(performance.now() / 1200) * 100;
        const qr = document.querySelector('#qr-checkin-scanner > div');
        if (qr) qr.style.left = `${x / 1280 * 720 - 8}px`;
        return [{ format: 'qr_code', boundingBox: { x, y: 160, width: 290, height: 290 } }];
    }
} });
else delete window.BarcodeDetector;

function Overview() {
    return <main style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 24 }}>
        {QR_PREVIEW_CASES.filter(item => item.response || item.error || item.pending).map(item => <article key={item.key}
            style={{ padding: 16, border: '1px solid var(--c-border-light)', borderRadius: 16 }}>
            <p style={{ margin: 0, color: 'var(--c-text-tertiary)', fontSize: 12 }}>{item.label}</p>
            <QrScanResult result={{ kind: item.kind || 'reservation', state: item.pending ? 'checking' : item.error ? 'error' : item.response.alreadyCheckedIn ? 'duplicate' : 'success',
                error: item.error, data: item.kind === 'waiting' ? item.response?.entry : item.response?.reservation }} />
        </article>)}
    </main>;
}
function Preview() {
    const [open, setOpen] = useState(true);
    return <>
        <header style={{ padding: '20px 24px', borderBottom: '1px solid var(--c-border-light)' }}>
            <strong style={{ fontSize: 24, color: 'var(--c-primary)' }}>RESERVE</strong>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-text-secondary)' }}>{fixture?.label || 'QR 결과 모음'} · 예시 카메라와 접수 데이터</p>
        </header>
        {scenario === 'overview' ? <Overview /> : <QrScannerSheet open={open} onClose={() => setOpen(false)} />}
    </>;
}
const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
createRoot(document.getElementById('root')).render(<ConfigProvider locale={koKR} theme={{ token: { colorPrimary: '#3182f6', fontFamily: 'inherit' } }}>
    <AntApp><QueryClientProvider client={client}><MemoryRouter><Preview /></MemoryRouter></QueryClientProvider></AntApp>
</ConfigProvider>);
