package kr.it.reserve.config.util;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.global.error.MemberException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.LocalDateTime;

public class SecurityUtil {

    /** 서명 검증한 토큰의 원인증 문맥만 보관한다. 현재 회원의 최신 로그인 시각으로 대체하지 않는다. */
    public record OAuthAuthenticationDetails(LocalDateTime authenticatedAt) { }

    private SecurityUtil() {
    }

    // 인증된 사용자 정보 가져오기
    public static Member getCurrentMember() {
        return getCurrentMember("인증되지 않은 사용자예요.");
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

    public static LocalDateTime getOAuthAuthenticationAt() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null && authentication.isAuthenticated()
                && authentication.getDetails() instanceof OAuthAuthenticationDetails details
                ? details.authenticatedAt() : null;
    }

    // 커뮤니티 등에서 비로그인 여부 확인할 때 사용
    public static boolean isLoggedIn() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        return authentication != null &&
                authentication.isAuthenticated() &&
                !"anonymousUser".equals(authentication.getPrincipal());
    }
}
