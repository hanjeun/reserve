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
 * HIBP 유출 비밀번호 목록을 보조 검증으로 사용한다.
 * SHA-1의 앞 5자리만 range API에 전송하고 전체 해시의 일치 여부는 서버 안에서 비교한다.
 * Add-Padding을 요청해 응답 크기로 접두사를 추정하는 정보를 줄인다.
 * 외부 조회 실패는 fail-open으로 처리하므로 false가 미유출을 보증하지는 않는다.
 * 가입·비밀번호 변경의 외부 지연을 제한하도록 전용 연결·요청 타임아웃을 사용한다.
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
            // 여기서 절대 예외를 던지지 않는다. 외부 API 장애가 회원가입 장애가 되면 안 된다.
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
            // 서버가 대문자로 주지만 대소문자를 가리지 않도록 한다.
            if (sep < 0 || sep != suffix.length()
                    || !line.regionMatches(true, 0, suffix, 0, sep)) continue;

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
