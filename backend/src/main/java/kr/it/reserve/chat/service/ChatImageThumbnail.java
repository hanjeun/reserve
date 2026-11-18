package kr.it.reserve.chat.service;

import kr.it.reserve.file.util.ImageThumbnail;
import kr.it.reserve.global.error.ChatException;
import org.springframework.http.HttpStatus;

final class ChatImageThumbnail {
    private static final int MAX_SIDE = 320;

    private ChatImageThumbnail() {}

    static byte[] create(byte[] original, int orientation) {
        try {
            return ImageThumbnail.create(original, orientation, MAX_SIDE);
        } catch (IllegalArgumentException invalid) {
            throw new ChatException("작은 사진을 만들 수 없어요.", HttpStatus.UNPROCESSABLE_ENTITY);
        }
    }
}
