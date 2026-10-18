package kr.it.reserve.global.redis;

import lombok.extern.slf4j.Slf4j;

import java.util.concurrent.atomic.AtomicLong;

/** Redis 장애의 요청마다 연결·로그를 반복하지 않는다. 권한·접수 데이터의 관문은 별도로 유지한다. */
@Slf4j
public class RedisFailureBackoff {
    private final AtomicLong retryAt = new AtomicLong();

    public boolean available() { return System.currentTimeMillis() >= retryAt.get(); }

    public void failed(Throwable failure) {
        long now = System.currentTimeMillis();
        long previous = retryAt.get();
        if (now >= previous && retryAt.compareAndSet(previous, now + 5_000)) {
            // 연결 문자열·암호·접수 대상은 로그에 넣지 않는다.
            log.warn("Redis unavailable ({}); using bounded local limits and waiting refresh", failure.getClass().getSimpleName());
        }
    }
}
