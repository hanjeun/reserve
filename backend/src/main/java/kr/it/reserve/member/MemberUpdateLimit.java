package kr.it.reserve.member;

import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.ratelimit.RateLimiter;
import org.springframework.http.HttpStatus;

public final class MemberUpdateLimit {
    private MemberUpdateLimit() {}

    public static void require(RateLimiter limiter, Long memberId, String ip) {
        // IP에서 거절된 요청은 회원 한도를 소비하지 않는다.
        if (!limiter.tryConsume("member-update:ip:" + ip, RateLimiter.Policy.MEMBER_UPDATE_IP)
                || !limiter.tryConsume("member-update:member:" + memberId, RateLimiter.Policy.MEMBER_UPDATE)) {
            throw new MemberException("수정 요청이 너무 많아요. 잠시 후 다시 시도해주세요.", HttpStatus.TOO_MANY_REQUESTS);
        }
    }
}
