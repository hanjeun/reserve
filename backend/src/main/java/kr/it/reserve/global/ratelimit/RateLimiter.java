package kr.it.reserve.global.ratelimit;

import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * IP 기반 Rate Limiter (in-memory, Bucket4j)
 *
 * 엔드포인트별 정책:
 *  - LOGIN      : 10분에 10회
 *  - EMAIL_SEND : 10분에 5회 (이메일 발송 비용 고려)
 *
 * <h2>버킷 만료가 왜 필요한가</h2>
 * 키가 {@code POLICY:IP} 라서 서로 다른 IP가 들어올 때마다 엔트리가 하나씩 늘어난다.
 * 예전엔 지우는 코드가 없어 <b>영구 누적</b>됐다 — 컨테이너가 {@code -Xmx512m} 라
 * 스캐너가 IP를 바꿔가며 긁으면 느린 OOM 벡터가 된다.
 * 정책 창이 최대 10분이므로 그보다 한참 지난 유휴 버킷은 지워도 제한이 느슨해지지 않는다
 * (지워진 뒤 다시 오면 새 버킷 = 가득 찬 상태인데, 어차피 10분이 지나 리필됐을 상태와 같다).
 *
 * <p>Caffeine 같은 캐시 라이브러리를 쓰지 않은 이유: 이 프로젝트는 Gradle dependency locking을
 * 쓰기 때문에 의존성 하나를 추가하면 락파일을 다시 만들어야 한다. 스윕 하나로 끝나는 일이라
 * {@code @Scheduled}(앱에 이미 {@code @EnableScheduling} 적용됨)로 처리한다.
 */
@Slf4j
@Component
public class RateLimiter {

    public enum Policy {
        LOGIN(10, Duration.ofMinutes(10)),
        /**
         * 로그인 실패를 <b>계정(이메일) 기준</b>으로 제한한다. IP 기준 LOGIN 과 함께 쓴다.
         *
         * <h3>왜 IP 만으로는 부족한가</h3>
         * 공격자가 프록시·봇넷으로 IP 를 돌리면 IP 카운터는 매번 새 버킷이 되어
         * <b>한 계정에 사실상 무제한으로 시도</b>할 수 있다. 반대로 IP 기준만 두면
         * 회사·학교·모바일 캐리어 NAT 뒤의 정상 사용자들이 한 사람 때문에 함께 막힌다.
         * 두 축이 서로의 사각지대를 메운다.
         *
         * <h3>실패할 때만 소모한다</h3>
         * 호출측(AuthApiController)이 <b>비밀번호 검증에 실패한 뒤에만</b> 토큰을 소모한다.
         * 성공한 로그인은 카운터를 쓰지 않으므로, 기기를 여러 대 쓰거나 자주 재로그인하는
         * 정상 사용자가 이 제한에 걸리지 않는다.
         *
         * <h3>알고 감수하는 트레이드오프</h3>
         * 공격자가 남의 계정에 일부러 실패를 쌓아 <b>계정 잠금 DoS</b>를 만들 수 있다.
         * 그래서 창을 짧게(10분) 두고 영구 잠금은 하지 않는다 — 완전 잠금은 그 DoS 를 훨씬 키운다.
         * 근본 방어는 유출 비밀번호 차단과 2FA 쪽이다(크리덴셜 스터핑은 계정당 1회만 시도하므로
         * 어떤 카운터에도 걸리지 않는다).
         */
        LOGIN_ACCOUNT(5, Duration.ofMinutes(10)),
        EMAIL_SEND(5, Duration.ofMinutes(10)),
        RESERVATION_CREATE(5, Duration.ofMinutes(1)),   // 1분에 5회 예약
        SIGNUP(5, Duration.ofMinutes(10)),              // 10분에 5회 회원가입
        /**
         * 이메일로 받은 <b>6자리 인증 코드</b> 대조 시도 제한 — IP 축 (2026-08-16 신설).
         *
         * <h3>왜 필요했나</h3>
         * 비밀번호 재설정·가입 인증 둘 다 코드가 6자리 숫자(90만 가지)인데
         * {@code verify-code} 에는 <b>아무 제한이 없었다</b>. nginx 의 20r/s 만으로도
         * 한 IP 가 코드 유효시간 5분 안에 6,000회를 시도할 수 있었고, 성공하면
         * 비밀번호 재설정 = <b>계정 탈취</b>다.
         *
         * <h3>1차 방어는 여기가 아니다</h3>
         * 진짜 상한은 토큰에 박은 {@code attemptCount}(5회)다 — 그건 요청지와 무관하게
         * "코드 한 장당" 걸리므로 IP 를 아무리 돌려도 우회되지 않는다.
         * 이 정책은 <b>코드를 계속 재발송하며 긁는</b> 패턴을 막는 2차 방어다.
         *
         * <p>30회로 잡은 이유: 회사·학교 NAT 뒤에서 여러 사람이 동시에 가입할 수 있다.
         * 사람이 코드 하나에 5회까지 틀린다 쳐도 10분에 30회를 넘기긴 어렵다.
         */
        CODE_VERIFY(30, Duration.ofMinutes(10)),
        /**
         * 같은 제한의 <b>계정(이메일) 축</b>. {@code LOGIN} + {@code LOGIN_ACCOUNT} 와 같은 구조다.
         *
         * <p>IP 축만 두면 분산 공격에 뚫리고, 계정 축만 두면 NAT 뒤 정상 사용자가 함께 막힌다.
         * 두 축이 서로의 사각지대를 메운다 — 근거는 {@link Policy#LOGIN_ACCOUNT} 주석에 있다.
         *
         * <p>⚠️ 키로 넘기는 이메일은 <b>소문자로 정규화</b>해야 한다. 안 하면
         * {@code A@x.com} 과 {@code a@x.com} 이 다른 버킷이 되어 제한이 무의미해진다.
         */
        CODE_VERIFY_ACCOUNT(20, Duration.ofMinutes(10)),
        // 주소 검색은 서버가 보관한 Kakao REST 키로 카카오 로컬 API를 프록시하는 엔드포인트다.
        // 인증은 걸려 있지만(SecurityConfig) 계정 하나만 있으면 카카오 API 쿼터를 무제한 소진시킬 수
        // 있었기 때문에 IP 기준 상한을 둔다. 주소 검색은 타이핑 중 디바운스(300ms)로 호출되는 UI라
        // 정상 사용자도 짧은 시간에 여러 번 호출한다 — 실사용을 막지 않을 만큼 넉넉하게 잡음.
        ADDRESS_SEARCH(60, Duration.ofMinutes(1)),       // 1분에 60회 주소 검색
        // 광고 노출/클릭/전환 기록. 로그인 없이 열려 있고(배너는 비로그인도 본다) 백엔드 상한이 없어서
        // 스크립트로 임프레션을 무한히 부풀릴 수 있었다. **광고는 유료 상품**이라 지표가 왜곡되면
        // 청구·성과 보고의 신뢰가 통째로 흔들린다(코드 주석은 "단순 참고용"이라 적혀 있지만,
        // 사장님은 그 숫자를 보고 재구매를 판단한다).
        //
        // 넉넉하게 잡은 이유: 배너가 화면에 보일 때마다 임프레션이 오르므로 정상 사용자도
        // 목록을 훑으면 분당 수십 건이 난다. 게다가 카페·사무실은 여러 사람이 한 IP 를 공유한다.
        // 정상 사용을 막지 않으면서 자동화된 부풀리기만 걸리는 선.
        AD_METRIC(120, Duration.ofMinutes(1)),
        /**
         * QR 체크인 시도 제한 — IP 축 (2026-08-19 신설).
         *
         * <h3>이 정책이 막는 것과 못 막는 것</h3>
         * QR 토큰은 HS256 서명이라 <b>추측으로 위조할 수는 없다</b> — 여긴 브루트포스 방어가 아니다.
         * 막는 건 자동화된 <b>토큰 재생/대량 시도</b>다. 유출된 토큰 묶음을 스크립트로 쏟아붓거나,
         * 만료·상태 오류 응답의 차이로 예약 상태를 캐내는(오라클) 패턴이 여기 걸린다.
         *
         * <p>실제 1차 방어는 세 겹으로 이미 있다 — 서명, 짧은 만료(발급 후 24h),
         * 그리고 <b>방문 당일만 허용</b>(ReservationService#checkInByQrToken).
         * 이건 그 위에 얹는 감쇠 장치이고, 짝이 되는 감사 로그가 있어야 의미가 산다.
         *
         * <p>분당 60으로 잡은 이유: 스캔 한 번에 사람 손이 최소 몇 초는 든다.
         * 문 앞에 사람이 줄을 서도 분당 60을 넘기긴 어렵고, 자동화는 이 선을 훨씬 넘는다.
         * 매장 태블릿은 IP 하나를 공유하므로 좁게 잡으면 성수기 정상 영업을 막게 된다.
         */
        QR_CHECKIN(60, Duration.ofMinutes(1));

        final int capacity;
        final Duration refillDuration;

        Policy(int capacity, Duration refillDuration) {
            this.capacity = capacity;
            this.refillDuration = refillDuration;
        }
    }

    /** 마지막 접근 이후 이만큼 지난 버킷은 스윕 대상. 최장 정책 창(10분)보다 넉넉하게 잡는다. */
    private static final Duration IDLE_TTL = Duration.ofMinutes(30);

    /**
     * 스윕이 못 따라갈 만큼 폭증했을 때의 안전밸브 임계.
     *
     * <p>엔트리 하나는 키(문자열 ~40B) + Bucket4j 버킷(~100B) 수준이라 50만 개라도 대략 70MB다.
     * {@code -Xmx512m}에서 감당할 수 있는 범위이므로, 임계를 낮게 잡고 공격적으로 비우는 것보다
     * 높게 잡고 최소한만 비우는 쪽이 안전하다.
     */
    private static final int MAX_ENTRIES = 500_000;

    /**
     * 안전밸브 발동 시 제거할 비율(오래된 것부터). 1/2 = 절반.
     *
     * <p>★ 절대 {@code buckets.clear()}로 바꾸지 말 것 — <b>fail-open이 된다.</b>
     * 전체를 비우면 모든 IP의 카운터가 리셋되므로, 공격자가 분산 스캐닝으로 맵을 부풀려
     * 일부러 안전밸브를 터뜨린 뒤 초기화된 LOGIN 카운터로 브루트포스를 재개할 수 있다.
     * 방어 장치가 그대로 우회 수단이 되는 셈이고, 하필 이 경로는 "공격 중일 때" 정확히 발동한다.
     * 마지막 접근이 오래된 것부터 지우면 <b>활발히 때리고 있는 IP의 버킷은 살아남는다</b>.
     */
    private static final int EVICTION_DIVISOR = 2;

    // key = "POLICY_NAME:IP주소"
    private final ConcurrentHashMap<String, Entry> buckets = new ConcurrentHashMap<>();

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
     * 요청 허용 여부 확인. false 반환 시 컨트롤러에서 429 응답해야 함.
     */
    /**
     * @param key 버킷을 가르는 식별자. 대개 IP 지만 정책에 따라 다른 값도 쓴다 —
     *            {@code LOGIN_ACCOUNT} 는 <b>이메일</b>을 넘긴다(계정 단위 제한).
     *            키가 정책 이름과 함께 조합되므로 정책끼리는 절대 섞이지 않는다.
     *            ⚠️ 이메일은 대소문자를 정규화해서 넘겨야 한다 — 안 하면
     *            {@code A@x.com} 과 {@code a@x.com} 이 서로 다른 버킷이 되어 제한을 우회한다.
     */
    public boolean tryConsume(String key, Policy policy) {
        Entry entry = buckets.computeIfAbsent(
                policy.name() + ":" + key,
                k -> new Entry(newBucket(policy))
        );
        entry.lastAccessMs.set(System.currentTimeMillis());
        return entry.bucket.tryConsume(1);
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
