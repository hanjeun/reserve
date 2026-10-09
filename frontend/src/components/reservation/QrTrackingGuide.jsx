import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

/** Optional device-local QR bounds. The decoder and server validation remain independent. */
export default function QrTrackingGuide({ previewRef, active, aspect }) {
    const frame = useRef(null);
    useEffect(() => {
        const guide = frame.current;
        const page = guide.ownerDocument;
        const view = page.defaultView;
        const Detector = view.BarcodeDetector;
        if (!active || !Detector) return undefined;
        let disposed = false;
        let timer;
        let detector;
        let inFlight = false;
        let lastSeen = 0;
        let lastBounds = null;
        const reset = () => {
            if (guide.dataset.tracking) delete guide.dataset.tracking;
            lastBounds = null;
        };
        const detect = async () => {
            if (disposed || page.hidden || inFlight) return;
            inFlight = true;
            try {
                let tracked = false;
                const video = previewRef.current?.querySelector('video');
                if (video?.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                    const codes = await detector.detect(video);
                    if (disposed || page.hidden) return;
                    const box = codes.filter(code => code.format === 'qr_code').map(code => code.boundingBox)
                        .filter(box => box && [box.x, box.y, box.width, box.height].every(Number.isFinite) && box.width > 0 && box.height > 0)
                        .sort((a, b) => b.width * b.height - a.width * a.height)[0];
                    if (box) {
                        const left = Math.max(0, box.x / video.videoWidth * 100 - 2);
                        const top = Math.max(0, box.y / video.videoHeight * 100 - 2);
                        const right = Math.min(100, (box.x + box.width) / video.videoWidth * 100 + 2);
                        const bottom = Math.min(100, (box.y + box.height) / video.videoHeight * 100 + 2);
                        if (right > left && bottom > top) {
                            const bounds = { x: left, y: top, w: right - left, h: bottom - top };
                            for (const [name, value] of Object.entries(bounds)) {
                                if (lastBounds?.[name] !== value) guide.style.setProperty(`--qr-${name}`, `${value}%`);
                            }
                            lastBounds = bounds;
                            if (!guide.dataset.tracking) guide.dataset.tracking = 'true';
                            lastSeen = view.performance.now();
                            tracked = true;
                        }
                    }
                }
                if (!tracked && view.performance.now() - lastSeen > 400) reset();
            } catch {
                // Unsupported camera/detector combinations keep the fixed guide.
                disposed = true;
                reset();
            } finally {
                inFlight = false;
                if (!disposed && !page.hidden) timer = view.setTimeout(detect, 200);
            }
        };
        const visibility = () => {
            view.clearTimeout(timer);
            if (page.hidden) reset();
            else void detect();
        };
        const start = async () => {
            try {
                const formats = await Detector.getSupportedFormats();
                if (disposed || !formats.includes('qr_code')) return;
                detector = new Detector({ formats: ['qr_code'] });
                page.addEventListener('visibilitychange', visibility);
                void detect();
            } catch { reset(); }
        };
        void start();
        return () => {
            disposed = true;
            view.clearTimeout(timer);
            page.removeEventListener('visibilitychange', visibility);
            reset();
        };
    }, [active, previewRef]);

    return <div className="reserve-qr-guide" aria-hidden="true">
        <div ref={frame} className="reserve-qr-guide__frame" style={aspect >= 1 ? { height: '100%' } : { width: '100%' }}>
            <span className="reserve-qr-guide__corner reserve-qr-guide__corner--tl" />
            <span className="reserve-qr-guide__corner reserve-qr-guide__corner--tr" />
            <span className="reserve-qr-guide__corner reserve-qr-guide__corner--bl" />
            <span className="reserve-qr-guide__corner reserve-qr-guide__corner--br" />
        </div>
    </div>;
}
QrTrackingGuide.propTypes = { previewRef: PropTypes.shape({ current: PropTypes.object }), active: PropTypes.bool.isRequired, aspect: PropTypes.number.isRequired };
