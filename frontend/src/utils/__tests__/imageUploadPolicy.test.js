import { describe, expect, it } from 'vitest';
import {
    MAX_IMAGE_REQUEST_BYTES,
    imageFileError,
    uploadListBytes,
} from '../imageUploadPolicy';

describe('image upload policy', () => {
    it('accepts only the formats the server can verify', () => {
        expect(imageFileError({ name: 'photo.webp', type: 'image/webp', size: 20 })).toBeNull();
        expect(imageFileError({ name: 'photo.avif', type: 'image/avif', size: 20 })).toContain('JPG');
        expect(imageFileError({ name: 'photo.exe', type: 'image/png', size: 20 })).toContain('JPG');
        expect(imageFileError({ name: 'photo.png', type: 'application/octet-stream', size: 20 })).toContain('JPG');
    });

    it('enforces the shared request budget across a list', () => {
        const list = [
            { originFileObj: { size: MAX_IMAGE_REQUEST_BYTES - 1 } },
            { originFileObj: { size: 2 } },
        ];
        expect(uploadListBytes(list)).toBe(MAX_IMAGE_REQUEST_BYTES + 1);
        expect(imageFileError({ name: 'large.png', type: 'image/png', size: MAX_IMAGE_REQUEST_BYTES + 1 }))
            .toContain('8MB');
    });
});
