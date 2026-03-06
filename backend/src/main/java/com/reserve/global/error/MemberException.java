package com.reserve.global.error;

import org.springframework.http.HttpStatus;

public class MemberException extends BusinessException {
    
    public MemberException(String message) {
        super(message, HttpStatus.BAD_REQUEST);
    }

    public MemberException(String message, HttpStatus status) {
        super(message, status);
    }

    // ========== 정적 팩토리 메서드 ==========
    
    /**
     * 404 NOT_FOUND - 회원을 찾을 수 없을 때
     */
    public static MemberException notFound() {
        return new MemberException("회원을 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
    }
    
    /**
     * 409 CONFLICT - 이미 존재하는 리소스
     */
    public static MemberException conflict(String message) {
        return new MemberException(message, HttpStatus.CONFLICT);
    }
    
    /**
     * 403 FORBIDDEN - 권한 없음
     */
    public static MemberException forbidden(String message) {
        return new MemberException(message, HttpStatus.FORBIDDEN);
    }
}