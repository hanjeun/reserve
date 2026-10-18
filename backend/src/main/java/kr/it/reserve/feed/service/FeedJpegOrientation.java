package kr.it.reserve.feed.service;

import java.awt.geom.AffineTransform;

/** JPEG APP1에서 방향 값 하나만 읽는다. 원본 메타데이터는 저장 이미지에 복사하지 않는다. */
final class FeedJpegOrientation {
    private FeedJpegOrientation() {}

    static int read(byte[] bytes) {
        if (bytes.length < 4 || u8(bytes, 0) != 0xff || u8(bytes, 1) != 0xd8) return 1;
        int offset = 2;
        while (offset < bytes.length) {
            if (u8(bytes, offset++) != 0xff) return 1;
            while (offset < bytes.length && u8(bytes, offset) == 0xff) offset++;
            if (offset >= bytes.length) return 1;
            int marker = u8(bytes, offset++);
            if (marker == 0xda || marker == 0xd9) return 1;
            if (marker == 0x01 || marker == 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) continue;
            if (offset + 2 > bytes.length) return 1;
            int length = (u8(bytes, offset) << 8) | u8(bytes, offset + 1);
            if (length < 2 || (long) offset + length > bytes.length) return 1;
            int content = offset + 2, end = offset + length;
            if (marker == 0xe1 && end - content >= 14
                    && bytes[content] == 'E' && bytes[content + 1] == 'x' && bytes[content + 2] == 'i'
                    && bytes[content + 3] == 'f' && bytes[content + 4] == 0 && bytes[content + 5] == 0) {
                int orientation = tiff(bytes, content + 6, end);
                if (orientation != 0) return orientation;
            }
            offset = end;
        }
        return 1;
    }

    private static int tiff(byte[] bytes, int start, int end) {
        boolean little = bytes[start] == 'I' && bytes[start + 1] == 'I';
        if (!little && !(bytes[start] == 'M' && bytes[start + 1] == 'M')) return 0;
        if (u16(bytes, start + 2, little) != 42) return 0;
        long first = (long) start + u32(bytes, start + 4, little);
        if (first < (long) start + 8 || first + 2 > end) return 0;
        int count = u16(bytes, (int) first, little);
        if (first + 2 + (long) count * 12 > end) return 0;
        for (int index = 0; index < count; index++) {
            int entry = (int) first + 2 + index * 12;
            if (u16(bytes, entry, little) == 0x0112 && u16(bytes, entry + 2, little) == 3
                    && u32(bytes, entry + 4, little) == 1) {
                int value = u16(bytes, entry + 8, little);
                return value >= 1 && value <= 8 ? value : 0;
            }
        }
        return 0;
    }

    static AffineTransform transform(int orientation, int width, int height) {
        return switch (orientation) {
            case 2 -> new AffineTransform(-1, 0, 0, 1, width, 0);
            case 3 -> new AffineTransform(-1, 0, 0, -1, width, height);
            case 4 -> new AffineTransform(1, 0, 0, -1, 0, height);
            case 5 -> new AffineTransform(0, 1, 1, 0, 0, 0);
            case 6 -> new AffineTransform(0, 1, -1, 0, height, 0);
            case 7 -> new AffineTransform(0, -1, -1, 0, height, width);
            case 8 -> new AffineTransform(0, -1, 1, 0, 0, width);
            default -> new AffineTransform();
        };
    }
    private static int u8(byte[] bytes, int offset) { return bytes[offset] & 0xff; }
    private static int u16(byte[] bytes, int offset, boolean little) {
        return little ? u8(bytes, offset) | (u8(bytes, offset + 1) << 8)
                : (u8(bytes, offset) << 8) | u8(bytes, offset + 1);
    }
    private static long u32(byte[] bytes, int offset, boolean little) {
        long first = u16(bytes, offset, little), second = u16(bytes, offset + 2, little);
        return little ? first | (second << 16) : (first << 16) | second;
    }
}
