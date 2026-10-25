package kr.it.reserve.global;

import kr.it.reserve.global.ratelimit.RateLimiter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 같은 식별자라도 정책이 다르면 서로의 호출 한도를 소모하지 않는지 확인한다. */
class RateLimiterPolicyTest {

    private static final String IP = "203.0.113.9";

    /** 정책 한도만큼 연속 소비하고, 마지막에 한 번 더 시도한 결과를 돌려준다. */
    private static boolean drainThenTryOnceMore(RateLimiter limiter, RateLimiter.Policy policy, String key) {
        for (int i = 0; i < policy.capacity(); i++) {
            assertThat(limiter.tryConsume(key, policy))
                    .as("한도 안(%d번째)에서는 통과해야 한다", i + 1)
                    .isTrue();
        }
        return limiter.tryConsume(key, policy);
    }

    @Test
    @DisplayName("★ 문의하기 한도를 다 써도 회원가입 인증메일(EMAIL_SEND)은 그대로 나간다")
    void 정책이_다르면_서로의_한도를_갉아먹지_않는다() {
        RateLimiter limiter = new RateLimiter();

        // 같은 IP 로 문의 한도를 전부 소진한다.
        assertThat(drainThenTryOnceMore(limiter, RateLimiter.Policy.INQUIRY_CREATE, IP))
                .as("문의 한도를 넘기면 막혀야 한다")
                .isFalse();

        // 같은 IP, 다른 정책 — 영향을 받으면 안 된다.
        assertThat(limiter.tryConsume(IP, RateLimiter.Policy.EMAIL_SEND))
                .as("문의 도배가 인증메일 발송을 막으면 안 된다")
                .isTrue();
        assertThat(limiter.tryConsume(IP, RateLimiter.Policy.CHAT_SEND))
                .as("문의 도배가 채팅 전송을 막으면 안 된다")
                .isTrue();
    }

    @Test
    @DisplayName("키(IP)가 다르면 서로 독립이다 — 한 사람이 다른 사람을 막을 수 없다")
    void 키가_다르면_독립이다() {
        RateLimiter limiter = new RateLimiter();

        assertThat(drainThenTryOnceMore(limiter, RateLimiter.Policy.INQUIRY_CREATE, IP)).isFalse();
        assertThat(limiter.tryConsume("198.51.100.7", RateLimiter.Policy.INQUIRY_CREATE))
                .as("다른 IP 는 자기 한도를 그대로 가져야 한다")
                .isTrue();
    }

    @Test
    @DisplayName("채팅 전송 한도는 사람이 손으로 치는 속도를 막지 않는다")
    void 채팅_한도는_정상_대화를_막지_않는다() {
        RateLimiter limiter = new RateLimiter();

        // 사람이 빠르게 치는 채팅은 분당 10~15줄이 상한선이다. 그 두 배까지는 통과해야 한다.
        for (int i = 0; i < 30; i++) {
            assertThat(limiter.tryConsume(IP, RateLimiter.Policy.CHAT_SEND))
                    .as("%d번째 메시지", i + 1)
                    .isTrue();
        }
        assertThat(limiter.tryConsume(IP, RateLimiter.Policy.CHAT_SEND))
                .as("그 이상은 자동화로 본다")
                .isFalse();
    }

    @Test
    @DisplayName("채팅 신고는 전송 한도와 분리되고 회원별로 제한된다")
    void 채팅_신고는_전송과_다른_회원에게_영향을_주지_않는다() {
        RateLimiter limiter = new RateLimiter();
        String reporter = "member-7";

        assertThat(drainThenTryOnceMore(limiter, RateLimiter.Policy.CHAT_REPORT, reporter)).isFalse();
        assertThat(limiter.tryConsume(reporter, RateLimiter.Policy.CHAT_SEND)).isTrue();
        assertThat(limiter.tryConsume("member-8", RateLimiter.Policy.CHAT_REPORT)).isTrue();
    }
}
