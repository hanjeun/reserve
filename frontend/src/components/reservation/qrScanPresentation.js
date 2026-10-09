export function qrScanErrorPresentation(error) {
    const message = typeof error === 'string' ? error : error?.message;
    if (error?.status === 429) return { icon: 'rate-limited', title: '잠시 후 다시 스캔해주세요.', message };
    if (error?.status >= 500) return { icon: 'server-unavailable', title: '체크인을 확인하지 못했어요.', message };
    if (/인터넷|연결이 끊|Network/i.test(message || '')) return { icon: 'network-offline', title: '연결을 확인해주세요.', message };
    if (/서버에 연결|응답이 너무 늦/.test(message || '')) return { icon: 'server-unavailable', title: '체크인을 확인하지 못했어요.', message };
    // Waiting tokens deliberately share one invalid/expired response. Do not invent an expiry diagnosis.
    if (/만료된 QR/.test(message || '')) return { icon: 'qr-expired', title: 'QR 유효 시간이 지났어요.', message };
    return { icon: 'qr-invalid', title: '체크인을 진행할 수 없어요.', message: message || 'QR을 확인하고 다시 시도해주세요.' };
}
