package com.reserve.global.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;

/**
 * IP 기반 Rate Limiter (in-memory, Bucket4j)
 *
 * 엔드포인트별 정책:
 *  - LOGIN      : 10분에 10회
 *  - EMAIL_SEND : 10분에 5회 (이메일 발송 비용 고려)
 */
@Component
public class RateLimiter {

    public enum Policy {
        LOGIN(10, Duration.ofMinutes(10)),
        EMAIL_SEND(5, Duration.ofMinutes(10)),
        RESERVATION_CREATE(5, Duration.ofMinutes(1)),   // 1분에 5회 예약
        SIGNUP(5, Duration.ofMinutes(10)),              // 10분에 5회 회원가입
        PASSWORD_RESET(3, Duration.ofMinutes(10)),       // 10분에 3회 비밀번호 리셋
        // 주소 검색은 서버가 보관한 Kakao REST 키로 카카오 로컬 API를 프록시하는 엔드포인트다.
        // 인증은 걸려 있지만(SecurityConfig) 계정 하나만 있으면 카카오 API 쿼터를 무제한 소진시킬 수
        // 있었기 때문에 IP 기준 상한을 둔다. 주소 검색은 타이핑 중 디바운스(300ms)로 호출되는 UI라
        // 정상 사용자도 짧은 시간에 여러 번 호출한다 — 실사용을 막지 않을 만큼 넉넉하게 잡음.
        ADDRESS_SEARCH(60, Duration.ofMinutes(1));       // 1분에 60회 주소 검색

        final int capacity;
        final Duration refillDuration;

        Policy(int capacity, Duration refillDuration) {
            this.capacity = capacity;
            this.refillDuration = refillDuration;
        }
    }

    // key = "POLICY_NAME:IP주소"
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    /**
     * 요청 허용 여부 확인. false 반환 시 컨트롤러에서 429 응답해야 함.
     */
    public boolean tryConsume(String ip, Policy policy) {
        Bucket bucket = buckets.computeIfAbsent(
                policy.name() + ":" + ip,
                k -> newBucket(policy)
        );
        return bucket.tryConsume(1);
    }

    private Bucket newBucket(Policy policy) {
        Bandwidth limit = Bandwidth.builder()
                .capacity(policy.capacity)
                .refillIntervally(policy.capacity, policy.refillDuration)
                .build();
        return Bucket.builder().addLimit(limit).build();
    }
}
