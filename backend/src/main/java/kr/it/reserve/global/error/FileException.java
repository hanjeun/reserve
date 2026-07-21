package kr.it.reserve.global.error;

import org.springframework.http.HttpStatus;

public class FileException extends BusinessException {

    public FileException(String message) {
        super(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    public FileException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========

    /** 500 - 파일 업로드 실패 */
    public static FileException uploadFailed() {
        return new FileException("파일을 저장하는 중 서버에 오류가 발생했습니다.", HttpStatus.INTERNAL_SERVER_ERROR);
    }

    /** 400 - 유효하지 않은 파일 */
    public static FileException invalid(String message) {
        return new FileException(message, HttpStatus.BAD_REQUEST);
    }
}