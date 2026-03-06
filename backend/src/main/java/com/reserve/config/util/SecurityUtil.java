package com.reserve.config.util;

import com.reserve.member.entity.Member;
import com.reserve.global.error.MemberException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

public class SecurityUtil {

    // 인증된 사용자 정보 가져오기
    public static Member getCurrentMember() {
        return getCurrentMember("인증되지 않은 사용자입니다.");
    }

    // 커스텀 메시지로 인증된 사용자 가져오기
    public static Member getCurrentMember(String errorMessage) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();

        if (authentication == null || !authentication.isAuthenticated() ||
                "anonymousUser".equals(authentication.getPrincipal())) {
            throw new MemberException(errorMessage);
        }

        return (Member) authentication.getPrincipal();
    }

    public static Long getCurrentMemberId() {
        return getCurrentMember().getId();
    }

    // 커뮤니티 등에서 비로그인 여부 확인할 때 사용
    public static boolean isLoggedIn() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null &&
                authentication.isAuthenticated() &&
                !"anonymousUser".equals(authentication.getPrincipal());
    }
}