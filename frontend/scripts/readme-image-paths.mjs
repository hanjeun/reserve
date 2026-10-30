// CLI 화면 이름과 공개 README 파일을 한 곳에서 연결한다.
export const README_IMAGE_FILENAMES = Object.freeze({
    home: 'home.jpg',
    stores: 'stores.png',
    'store-detail': 'store-detail.png',
    business: 'business.jpg',
    admin: 'admin.png',
    monitoring: 'grafana.jpg',
});

export function readmeImageDimensions(bytes) {
    if (bytes.length >= 24 && bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') {
        return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    }
    if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) throw new Error('Unknown screenshot format');
    const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
    for (let offset = 2; offset + 4 <= bytes.length;) {
        if (bytes[offset] !== 0xff) throw new Error('Invalid JPEG segment');
        const marker = bytes[offset + 1];
        const length = bytes.readUInt16BE(offset + 2);
        if (length < 2 || offset + length + 2 > bytes.length) throw new Error('Invalid JPEG segment length');
        if (frameMarkers.has(marker) && length >= 8) {
            return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
        }
        offset += length + 2;
    }
    throw new Error('No JPEG dimensions');
}
