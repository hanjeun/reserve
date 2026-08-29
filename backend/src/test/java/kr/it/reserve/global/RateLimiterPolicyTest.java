package kr.it.reserve.global;

import kr.it.reserve.global.ratelimit.RateLimiter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 레이트리밋 <b>정책 분리</b>가 실제로 성립하는지.
 *
 * <h2>왜 이 테스트가 있나 — 2026-08-25</h2>
 * 문의하기({@code POST /api/inquiries})에 상한을 걸 때, 이미 있는 {@code EMAIL_SEND} 를
 * 재사용하자는 선택지가 있었다. 둘 다 "메일을 보내는 경로"라서 그럴듯해 보인다.
 *
 * <p>하지만 버킷을 공유하면 <b>문의 도배가 회원가입 인증메일까지 같이 막는다.</b>
 * 즉 공격자가 공개 엔드포인트를 두드려 <b>정상 가입을 막을 수 있게 된다</b> —
 * 방어 장치가 서비스 거부 수단으로 바뀌는 셈이다.
 *
 * <p>{@code RateLimiter} 는 키를 {@code POLICY_NAME:식별자} 로 만들기 때문에 정책만 나누면
 * 그 간섭이 사라진다. 다만 그건 <b>구현 세부사항</b>이고, 키 조합 방식이 바뀌면 조용히 깨진다.
 * 그래서 "정책이 다르면 서로의 한도를 갉아먹지 않는다"를 계약으로 못 박는다.
 *
 * <p>스프링 컨텍스트를 띄우지 않는다 — 검증 대상이 버킷 계산뿐이다.
 */
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
}
