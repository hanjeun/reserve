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
        MEMBER_UPDATE(20, Duration.ofMinutes(1)),
        MEMBER_UPDATE_IP(60, Duration.ofMinutes(1)),
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
        /** 화면 열기·조회·취소는 실제 인증 응답의 한도를 소모하지 않는다. */
        MFA_LIFECYCLE(120, Duration.ofMinutes(1)),
        MFA_LIFECYCLE_ACCOUNT(30, Duration.ofMinutes(1)),
        MFA_CANCEL(60, Duration.ofMinutes(1)),
        OAUTH_START(30, Duration.ofMinutes(1)),
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
        INQUIRY_CREATE(4, Duration.ofMinutes(10)),
        INQUIRY_MEMBER_CREATE(3, Duration.ofMinutes(10)),
        ADMIN_MAIL_SEND(10, Duration.ofMinutes(1)),
        MAIL_PREVIEW(20, Duration.ofMinutes(1)),
        RESEND_WEBHOOK_IP(120, Duration.ofMinutes(1)),
        RESEND_MAIL_RETRIEVE(2, Duration.ofSeconds(1)),
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

    /** 메모리 상한에서는 기존 제한을 보존하고 새 키를 거절한다. */
    private static final int MAX_ENTRIES = 500_000;

    // key = "POLICY_NAME:IP주소"
    private final ConcurrentHashMap<String, Entry> buckets = new ConcurrentHashMap<>();
    private final int maxEntries;

    public RateLimiter() { this(MAX_ENTRIES); }
    RateLimiter(int maxEntries) {
        if (maxEntries < 1) throw new IllegalArgumentException("Rate limiter capacity must be positive");
        this.maxEntries = maxEntries;
    }

    @Autowired(required = false)
    private RedisRequestLimiter sharedWaitingLimits;

    @Autowired(required = false)
    private RedisAuthRateLimiter sharedAuthenticationLimits;

    private static final String AUTH_RECEIPTS = RateLimiter.class.getName() + ".receipts";

    @SuppressWarnings("unchecked")
    private java.util.Map<String, RedisAuthRateLimiter.Receipt> authenticationReceipts() {
        if (!(org.springframework.web.context.request.RequestContextHolder.getRequestAttributes()
                instanceof org.springframework.web.context.request.ServletRequestAttributes attributes)) return null;
        var request = attributes.getRequest();
        var values = (java.util.Map<String, RedisAuthRateLimiter.Receipt>) request.getAttribute(AUTH_RECEIPTS);
        if (values == null) { values = new java.util.HashMap<>(); request.setAttribute(AUTH_RECEIPTS, values); }
        return values;
    }

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
        if (sharedAuthenticationLimits != null && sharedAuthenticationLimits.supports(policy)) {
            var receipts = sharedAuthenticationLimits.refundable(policy) ? authenticationReceipts() : null;
            String identity = policy.name() + ":" + key;
            if (receipts != null) receipts.remove(identity);
            var consumed = sharedAuthenticationLimits.consume(key, policy);
            if (receipts != null && consumed.receipt() != null) receipts.put(identity, consumed.receipt());
            return consumed.allowed();
        }
        String bucketKey = policy.name() + ":" + key;
        Entry entry = touchEntry(bucketKey);
        if (entry == null) {
            // 새 키만 직렬화한다. 상한에서 활성 제한을 버리지 않고 새 키를 거절한다.
            synchronized (buckets) {
                entry = touchEntry(bucketKey);
                if (entry == null) {
                    if (buckets.size() >= maxEntries) return false;
                    entry = new Entry(newBucket(policy));
                    buckets.put(bucketKey, entry);
                }
            }
        }
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
        if (sharedAuthenticationLimits != null && sharedAuthenticationLimits.supports(policy)) {
            var receipts = authenticationReceipts();
            var receipt = receipts == null ? null : receipts.remove(policy.name() + ":" + key);
            // 반환을 확인하지 못하면 소비를 유지하며 성공한 인증을 되돌리지 않는다.
            try { sharedAuthenticationLimits.refund(receipt); }
            catch (RedisAuthRateLimiter.Unavailable ignored) { log.warn("Shared authentication limit refund could not be confirmed"); }
            return;
        }
        buckets.computeIfPresent(policy.name() + ":" + key, (ignored, entry) -> {
            entry.lastAccessMs.set(System.currentTimeMillis());
            entry.bucket.addTokens(1);
            return entry;
        });
    }

    /** 접근 시각 갱신과 제거를 키별로 직렬화해 사용 중인 제한이 초기화되지 않게 한다. */
    private Entry touchEntry(String key) {
        return buckets.computeIfPresent(key, (ignored, entry) -> {
            entry.lastAccessMs.set(System.currentTimeMillis());
            return entry;
        });
    }

    /** 최장 제한 창보다 오래 유휴 상태인 버킷만 정리한다. */
    @Scheduled(fixedDelay = 10 * 60 * 1000)
    public void evictIdleBuckets() {
        int before = buckets.size();

        long threshold = System.currentTimeMillis() - IDLE_TTL.toMillis();
        buckets.keySet().forEach(key -> buckets.computeIfPresent(key,
                (ignored, entry) -> entry.lastAccessMs.get() < threshold ? null : entry));

        int idleRemoved = before - buckets.size();
        if (idleRemoved > 0) {
            log.debug("Evicted {} idle rate limiter buckets ({} remaining)", idleRemoved, buckets.size());
        }
    }

    private Bucket newBucket(Policy policy) {
        Bandwidth limit = Bandwidth.builder()
                .capacity(policy.capacity)
                .refillIntervally(policy.capacity, policy.refillDuration)
                .build();
        return Bucket.builder().addLimit(limit).build();
    }
}
