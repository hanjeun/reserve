package kr.it.reserve.global.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 정책별 로컬 Bucket4j 제한을 적용하고 구성된 대기 접수·QR 정책에는 Redis 공유 제한도 확인한다.
 * 제한 수치와 축은 Policy를 정본으로 사용한다.
 * 유휴 버킷은 제한 창을 보존하는 만료 기준으로 정리해 키가 무한히 누적되지 않게 한다.
 */
@Slf4j
@Component
public class RateLimiter {

    public enum Policy {
        LOGIN(10, Duration.ofMinutes(10)),
        /**
         * IP 제한을 보완하는 계정별 로그인 실패 제한이다.
         * 검증 전에 한도를 예약하고 성공한 요청의 토큰 하나만 반환해 이전 실패 누적은 유지한다.
         * 공격자의 의도적 실패로 계정이 일시 제한될 수 있으므로 영구 잠금으로 사용하지 않는다.
         */
        LOGIN_ACCOUNT(5, Duration.ofMinutes(10)),
        EMAIL_SEND(5, Duration.ofMinutes(10)),
        LOGIN_METHOD_CHANGE(5, Duration.ofMinutes(10)),
        LOGIN_METHOD_EMAIL(5, Duration.ofMinutes(10)),
        LOGIN_METHOD_VERIFY(20, Duration.ofMinutes(10)),
        RESERVATION_CREATE(5, Duration.ofMinutes(1)),   // 1분에 5회 예약
        RESERVATION_REMOVE(30, Duration.ofMinutes(1)),
        PAYMENT_VERIFY(30, Duration.ofMinutes(1)),
        WAITING_JOIN(5, Duration.ofMinutes(1)),         // 회원·IP별 고객 웨이팅 접수 제한
        SIGNUP(5, Duration.ofMinutes(10)),              // 10분에 5회 회원가입
        /**
         * 인증 코드 대조의 IP별 보조 제한이다. 일차 상한은 토큰별 실패 횟수가 담당한다.
         * 공유 NAT의 정상 사용자를 고려해 IP 한도를 토큰별 한도보다 넓게 둔다.
         */
        CODE_VERIFY(30, Duration.ofMinutes(10)),
        /** IP·계정별 제한을 함께 적용한다. 계정 이메일은 소문자로 정규화해 대소문자 변경으로 우회하지 못하게 한다. */
        CODE_VERIFY_ACCOUNT(20, Duration.ofMinutes(10)),
        // 주소 검색은 서버가 보관한 Kakao REST 키로 카카오 로컬 API를 프록시하는 엔드포인트다.
        // 인증은 걸려 있지만(SecurityConfig) 계정 하나만 있으면 카카오 API 쿼터를 무제한 소진시킬 수
        // 있었기 때문에 IP 기준 상한을 둔다. 주소 검색은 타이핑 중 디바운스(300ms)로 호출되는 UI라
        // 정상 사용자도 짧은 시간에 여러 번 호출한다 — 실사용을 막지 않을 만큼 넉넉하게 잡음.
        ADDRESS_SEARCH(60, Duration.ofMinutes(1)),       // 공개 지표 요청은 공유 IP의 정상 사용을 감안해 호출량을 제한한다.
        AD_METRIC(120, Duration.ofMinutes(1)),
        // 공개 프로필과 작성글 조회는 같은 방문자 한도를 쓰되 다른 읽기·쓰기 정책과 분리한다.
        PROFILE_READ(120, Duration.ofMinutes(1)),
        SERVICE_ENTRY_IP_READ(600, Duration.ofMinutes(1)),
        SERVICE_ENTRY_READ(60, Duration.ofMinutes(1)),
        SERVICE_ENTRY_JOIN(120, Duration.ofMinutes(1)),
        // 비상 모드에서는 JWT·DB 작업 전에 제한한다. 기존 거래 복구는 별도 정책을 사용한다.
        SERVICE_EMERGENCY_IP(120, Duration.ofMinutes(1)),
        SERVICE_EMERGENCY_GLOBAL(30, Duration.ofSeconds(1)),
        /**
         * QR 토큰의 자동 재생·대량 시도를 줄이는 IP 제한이다.
         * 서명·만료·방문 당일 및 소유 가게 검증을 대체하지 않는다.
         * 매장 기기가 같은 IP를 공유할 수 있으므로 한도는 정상 스캔 흐름과 함께 검토한다.
         */
        QR_CHECKIN(60, Duration.ofMinutes(1)),
        /** 메시지 저장량을 제한하기 위해 채팅 전송에 IP별 상한을 적용한다. */
        CHAT_SEND(30, Duration.ofMinutes(1)),
        /**
         * 채팅 신고 — 로그인 회원 ID 축. 같은 대상은 DB 멱등 키로 한 번만 저장하지만, 서로 다른 메시지를
         * 자동 제출해 관리자 큐를 부풀리는 경로는 별도로 제한한다. 정상 신고가 10분에 5건을 넘는 경우는
         * 드물고, IP 대신 회원 축을 써 회사·통신사 NAT의 다른 사용자를 함께 막지 않는다.
         */
        CHAT_REPORT(5, Duration.ofMinutes(10)),
        /**
         * 비로그인 문의 작성으로 인한 DB·알림 메일 도배를 제한한다.
         * 가입 인증 메일과 버킷을 분리해 문의 요청이 인증 메일 한도까지 소진하지 못하게 한다.
         */
        INQUIRY_CREATE(5, Duration.ofMinutes(10)),
        // 공개 지역 선택 화면이 외부 관광 API·이미지 프록시를 비용 없이 소진하지 않도록 IP 기준으로 제한한다.
        TOURISM_REGION_PHOTO(60, Duration.ofMinutes(1));

        final int capacity;
        final Duration refillDuration;

        Policy(int capacity, Duration refillDuration) {
            this.capacity = capacity;
            this.refillDuration = refillDuration;
        }

        public int capacity() {
            return capacity;
        }
    }

    /** 마지막 접근 이후 이만큼 지난 버킷은 스윕 대상. 최장 정책 창(10분)보다 넉넉하게 잡는다. */
    private static final Duration IDLE_TTL = Duration.ofMinutes(30);

    // 이메일·IP·내부 식별자보다 긴 요청 원문을 버킷 키로 보관하지 않는다.
    private static final int MAX_KEY_LENGTH = 512;

    /**
     * 스윕이 못 따라갈 만큼 폭증했을 때의 안전밸브 임계.
     *
     * <p>엔트리 하나는 키(문자열 ~40B) + Bucket4j 버킷(~100B) 수준이라 50만 개라도 대략 70MB다.
     * {@code -Xmx512m}에서 감당할 수 있는 범위이므로, 임계를 낮게 잡고 공격적으로 비우는 것보다
     * 높게 잡고 최소한만 비우는 쪽이 안전하다.
     */
    private static final int MAX_ENTRIES = 500_000;

    /** 활성 공격자의 제한을 초기화하지 않도록 버킷 전체를 비우지 않고 오래된 일부만 제거한다. */
    private static final int EVICTION_DIVISOR = 2;

    // key = "POLICY_NAME:IP주소"
    private final ConcurrentHashMap<String, Entry> buckets = new ConcurrentHashMap<>();

    @Autowired(required = false)
    private RedisRequestLimiter sharedWaitingLimits;

    /** 버킷 + 마지막 접근 시각(ms). 접근 시각은 스윕 판단에만 쓰이므로 정확한 동기화가 필요 없다. */
    private static final class Entry {
        private final Bucket bucket;
        private final AtomicLong lastAccessMs;

        private Entry(Bucket bucket) {
            this.bucket = bucket;
            this.lastAccessMs = new AtomicLong(System.currentTimeMillis());
        }
    }

    /**
     * 거부 시 호출부가 429를 반환해야 한다.
     * @param key 정책과 함께 버킷을 구분하는 값. 계정 이메일은 소문자로 정규화해야 한다.
     */
    public boolean tryConsume(String key, Policy policy) {
        if (key == null || key.length() > MAX_KEY_LENGTH) return false;
        Entry entry = buckets.computeIfAbsent(
                policy.name() + ":" + key,
                k -> new Entry(newBucket(policy))
        );
        entry.lastAccessMs.set(System.currentTimeMillis());
        if (!entry.bucket.tryConsume(1)) return false;
        if (sharedWaitingLimits == null || (policy != Policy.WAITING_JOIN && policy != Policy.QR_CHECKIN)) return true;
        Boolean shared = sharedWaitingLimits.tryConsume(key, policy, policy.capacity, policy.refillDuration);
        if (Boolean.FALSE.equals(shared)) entry.bucket.addTokens(1);
        // 공유 거부는 거부하고, 장애 때는 이미 소비한 로컬 버킷을 사용한다. 무제한 허용하지 않는다.
        return !Boolean.FALSE.equals(shared);
    }

    /** 성공한 검증이 예약했던 토큰 1개만 반환한다. 기존 실패와 리필 시점은 유지한다. */
    public void refund(String key, Policy policy) {
        if (key == null || key.length() > MAX_KEY_LENGTH) return;
        buckets.computeIfPresent(policy.name() + ":" + key, (ignored, entry) -> {
            entry.lastAccessMs.set(System.currentTimeMillis());
            entry.bucket.addTokens(1);
            return entry;
        });
    }

    /**
     * 유휴 버킷 정리. 10분마다 돈다.
     *
     * <p>{@code ConcurrentHashMap}은 순회 중 제거가 안전하므로 별도 락이 필요 없다.
     * 스윕과 {@code tryConsume}이 겹쳐 방금 만들어진 버킷이 지워지는 최악의 경우에도
     * 결과는 "버킷이 하나 새로 만들어진다" 뿐이라 정합성 문제가 없다.
     */
    @Scheduled(fixedDelay = 10 * 60 * 1000)
    public void evictIdleBuckets() {
        int before = buckets.size();

        long threshold = System.currentTimeMillis() - IDLE_TTL.toMillis();
        buckets.entrySet().removeIf(e -> e.getValue().lastAccessMs.get() < threshold);

        int idleRemoved = before - buckets.size();
        if (idleRemoved > 0) {
            log.debug("Evicted {} idle rate limiter buckets ({} remaining)", idleRemoved, buckets.size());
        }

        // TTL 스윕으로도 안 줄었다면 = 대부분이 "최근에 접근된" 버킷이다.
        // 정상 트래픽으로는 도달할 수 없는 수치이므로 분산 스캐닝을 의심한다.
        if (buckets.size() > MAX_ENTRIES) {
            evictOldestPortion();
        }
    }

    /**
     * 마지막 접근이 오래된 것부터 일부만 제거한다(안전밸브).
     *
     * <p>정렬 기준이 {@code lastAccessMs}이므로 <b>지금 활발히 요청을 보내는 IP는 살아남고</b>,
     * 잠잠해진 IP의 버킷이 먼저 나간다. 살아남는 쪽이 곧 제한을 걸어야 할 대상이라
     * fail-open이 되지 않는다({@link #EVICTION_DIVISOR} 주석 참고).
     */
    private void evictOldestPortion() {
        int size = buckets.size();
        int target = size / EVICTION_DIVISOR;
        if (target <= 0) {
            return;
        }

        // 제거 경계가 될 접근 시각을 구한다. 전체 정렬 대신 k번째 값만 뽑아 부하를 줄인다.
        long[] times = buckets.values().stream()
                .mapToLong(e -> e.lastAccessMs.get())
                .sorted()
                .toArray();
        long cutoff = times[Math.min(target, times.length - 1)];

        buckets.entrySet().removeIf(e -> e.getValue().lastAccessMs.get() <= cutoff);

        log.warn("Rate limiter bucket map exceeded {} entries ({}); evicted oldest portion, {} remaining. "
                        + "This usually means distributed scanning.",
                MAX_ENTRIES, size, buckets.size());
    }

    private Bucket newBucket(Policy policy) {
        Bandwidth limit = Bandwidth.builder()
                .capacity(policy.capacity)
                .refillIntervally(policy.capacity, policy.refillDuration)
                .build();
        return Bucket.builder().addLimit(limit).build();
    }
}
