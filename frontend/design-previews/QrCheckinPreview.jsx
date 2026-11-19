import { useState } from 'react';
import PropTypes from 'prop-types';
import QrScannerSheet from '../src/components/reservation/QrScannerSheet';
import QrScanResult from '../src/components/reservation/QrScanResult';
import { QR_PREVIEW_CASES } from './qr-checkin-fixtures';

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

export default function QrCheckinPreview({ fixture, scenario }) {
    const [open, setOpen] = useState(true);
    return <>
        <header style={{ padding: '20px 24px', borderBottom: '1px solid var(--c-border-light)' }}>
            <strong style={{ fontSize: 24, color: 'var(--c-primary)' }}>RESERVE</strong>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'var(--c-text-secondary)' }}>{fixture?.label || 'QR 결과 모음'} · 예시 카메라와 접수 데이터</p>
        </header>
        {scenario === 'overview' ? <Overview /> : <QrScannerSheet open={open} onClose={() => setOpen(false)} />}
    </>;
}

QrCheckinPreview.propTypes = { fixture: PropTypes.object, scenario: PropTypes.string.isRequired };
