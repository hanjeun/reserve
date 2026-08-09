package kr.it.reserve.global.security;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

/**
 * 유출된 비밀번호(Have I Been Pwned) 차단.
 *
 * <h2>왜 이게 필요한가</h2>
 * 이 서비스의 비밀번호 정책은 <b>"8자 이상"이 전부</b>다. 그런데 실제 계정 탈취의 주력은
 * 무차별 대입이 아니라 <b>크리덴셜 스터핑</b>이다 — 다른 사이트에서 유출된 (이메일, 비밀번호)
 * 쌍을 그대로 넣어보는 공격이라 <b>계정당 시도가 단 1회</b>다.
 * 그래서 {@code RateLimiter}의 LOGIN·LOGIN_ACCOUNT 카운터로는 원리상 잡히지 않는다.
 * 실질 방어는 (1) 이미 유출된 비밀번호를 애초에 못 쓰게 하는 것, (2) 2FA 두 가지뿐이다.
 *
 * <h2>비밀번호를 외부로 보내지 않는다 (k-anonymity)</h2>
 * 비밀번호의 SHA-1 해시 중 <b>앞 5자리만</b> 보내고, 서버는 그 접두사로 시작하는 해시
 * 수백~수천 개를 통째로 돌려준다. 일치 여부 판정은 <b>우리 서버 안에서</b> 한다.
 * 즉 비밀번호도, 전체 해시도 외부로 나가지 않는다. 접두사 하나로 좁혀지는 후보가 너무 많아
 * API 제공자도 어떤 비밀번호를 물어본 것인지 알 수 없다.
 *
 * <p>{@code Add-Padding: true} 를 함께 보낸다. 응답 크기가 접두사마다 다르면 중간자가
 * 크기만 보고 어떤 접두사를 조회했는지 좁힐 수 있어서, 제공자가 더미 항목을 채워 크기를 균일화해준다.
 *
 * <h2>★ 실패하면 통과시킨다 (fail-open)</h2>
 * 외부 API가 죽었다고 <b>회원가입·비밀번호 변경이 막히면 안 된다.</b> 이건 "있으면 더 좋은"
 * 부가 검증이지 인증 경로가 아니다. 타임아웃도 짧게(연결 2초·전체 3초) 잡아
 * 외부 지연이 우리 응답 시간으로 새어 들어오지 않게 한다.
 * 공유 {@code RestTemplate} 빈을 쓰지 않은 이유가 이것이다 — 그쪽은 결제·소셜 연결 해제용이라
 * 5초/10초로 잡혀 있어 가입 폼을 10초씩 붙잡을 수 있다.
 *
 * <h2>복잡도 강제를 하지 않는 이유</h2>
 * 특수문자·대문자 강제는 <b>NIST SP 800-63B가 명시적으로 권장하지 않는다</b>.
 * 사용자를 예측 가능한 패턴으로 몰아넣어 실제 엔트로피는 늘지 않고 재사용만 늘기 때문이다.
 * "길이 하한 + 유출 목록 차단"이 현재의 정석이다.
 */
@Slf4j
@Component
public class PwnedPasswordChecker {

    private static final String API_URL = "https://api.pwnedpasswords.com/range/";
    private static final int PREFIX_LENGTH = 5;

    /**
     * 운영에서는 켜둔다. <b>테스트 프로파일에서는 꺼야 한다</b> —
     * 켜두면 단위 테스트가 외부 네트워크에 의존하게 되고, 오프라인 CI에서 매번 3초씩 기다린다.
     * ({@code src/test/resources/application.yml} 에서 false)
     */
    @Value("${security.pwned-password.enabled:true}")
    private boolean enabled;

    /**
     * 유출 횟수가 이 값 이상이면 거부한다. 기본 1 = <b>한 번이라도 유출된 적 있으면 거부</b>.
     * 유출 코퍼스에 한 번이라도 등장한 비밀번호는 이미 공격자 워드리스트에 들어 있다고 봐야 한다.
     * 사용자 반발이 크면 값을 올릴 수 있게 열어뒀지만, 올릴수록 방어력이 급격히 떨어진다.
     */
    @Value("${security.pwned-password.threshold:1}")
    private int threshold;

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(2))
            .followRedirects(HttpClient.Redirect.NEVER)
            .build();

    /**
     * 유출된 비밀번호인지 확인한다.
     *
     * @return 유출 목록에 있으면 {@code true}. <b>확인에 실패한 경우에도 {@code false}</b>(fail-open).
     */
    public boolean isPwned(String password) {
        if (!enabled || password == null || password.isBlank()) {
            return false;
        }

        try {
            String hash = sha1Hex(password);
            String prefix = hash.substring(0, PREFIX_LENGTH);
            String suffix = hash.substring(PREFIX_LENGTH);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(API_URL + prefix))
                    .header("Add-Padding", "true")
                    .header("User-Agent", "RESERVE-password-check")
                    .timeout(Duration.ofSeconds(3))
                    .GET()
                    .build();

            HttpResponse<String> response =
                    httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));

            if (response.statusCode() != 200) {
                log.warn("Pwned password check skipped: unexpected status {}", response.statusCode());
                return false;
            }

            return containsSuffixOverThreshold(response.body(), suffix);

        } catch (InterruptedException e) {
            // 인터럽트를 삼키면 상위에서 취소 신호를 영영 못 본다. 상태를 복원하고 통과시킨다.
            Thread.currentThread().interrupt();
            log.warn("Pwned password check interrupted");
            return false;
        } catch (Exception e) {
            // ★ 여기서 절대 예외를 던지지 않는다. 외부 API 장애가 회원가입 장애가 되면 안 된다.
            //   메시지에 비밀번호가 섞일 여지가 없도록 클래스명만 남긴다.
            log.warn("Pwned password check failed, allowing: {}", e.getClass().getSimpleName());
            return false;
        }
    }

    /**
     * 응답 본문에서 접미사를 찾아 유출 횟수가 임계 이상인지 본다.
     *
     * <p>응답은 {@code SUFFIX:COUNT} 줄의 나열이다. 패딩으로 채워진 더미 항목은
     * {@code COUNT} 가 0 이므로 임계값 비교에서 자연히 걸러진다.
     */
    private boolean containsSuffixOverThreshold(String body, String suffix) {
        for (String line : body.split("\n")) {
            int sep = line.indexOf(':');
            if (sep < 0) continue;
            if (sep != suffix.length()) continue;

            // 서버가 대문자로 주지만 대소문자를 가리지 않도록 한다.
            if (!line.regionMatches(true, 0, suffix, 0, sep)) continue;

            try {
                int count = Integer.parseInt(line.substring(sep + 1).trim());
                return count >= threshold;
            } catch (NumberFormatException e) {
                return true;   // 접미사는 일치했는데 횟수를 못 읽었다 = 목록에 있다는 뜻이므로 거부 쪽으로.
            }
        }
        return false;
    }

    /**
     * SHA-1 은 서명·저장용으로는 이미 깨진 알고리즘이지만 여기서는 <b>HIBP API 규격</b>이라
     * 선택지가 없다. 비밀번호 저장은 그대로 bcrypt 를 쓴다 — 이 해시는 외부 조회 키일 뿐
     * 어디에도 저장되지 않는다.
     */
    private String sha1Hex(String password) throws NoSuchAlgorithmException {
        MessageDigest digest = MessageDigest.getInstance("SHA-1");
        byte[] hash = digest.digest(password.getBytes(StandardCharsets.UTF_8));
        return HexFormat.of().withUpperCase().formatHex(hash);
    }
}
