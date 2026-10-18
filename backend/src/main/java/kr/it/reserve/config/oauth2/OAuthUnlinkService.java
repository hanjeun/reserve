package kr.it.reserve.config.oauth2;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.AuthProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestTemplate;

/**
 * OAuth 연동 해제 서비스
 * 회원탈퇴 시 각 플랫폼의 연동을 해제합니다.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OAuthUnlinkService {

    private final RestTemplate restTemplate;

    @Value("${spring.security.oauth2.client.registration.naver.client-id:}")
    private String naverClientId = "";

    @Value("${spring.security.oauth2.client.registration.naver.client-secret:}")
    private String naverClientSecret = "";

    /**
     * OAuth 연동 해제 (회원탈퇴 시 호출)
     *
     * @param member 탈퇴할 회원
     * @return 연동 해제 성공 여부
     */
    public boolean unlinkOAuth(Member member) {
        if (!member.isOAuthUser()) return true;

        String accessToken = member.getOauthAccessToken();
        if (accessToken == null) {
            log.warn("OAuth unlink failed: no access token. memberId={}", member.getId());
            return false;
        }

        return unlink(member.getProvider(), accessToken, member.getId());
    }

    /** 영속 outbox 작업에 저장된 최소 스냅샷으로 OAuth 연동을 해제한다. */
    public boolean unlink(AuthProvider provider, String accessToken, Long memberId) {
        if (provider == null || provider == AuthProvider.LOCAL) return true;
        if (accessToken == null || accessToken.isBlank()) {
            log.warn("OAuth unlink failed: no access token. memberId={}", memberId);
            return false;
        }

        return unlinkWithResult(provider, accessToken, memberId).outcome() == Outcome.COMPLETED;
    }

    /** 영구적인 자격 증명/요청 오류를 자동 재시도에서 분리한다. 응답 원문은 보존하지 않는다. */
    public Result unlinkWithResult(AuthProvider provider, String accessToken, Long memberId) {
        if (provider == null || provider == AuthProvider.LOCAL) return Result.completed();
        if (accessToken == null || accessToken.isBlank()) return Result.blocked("TOKEN_MISSING");
        if (provider == AuthProvider.NAVER && (naverClientId.isBlank() || naverClientSecret.isBlank())) {
            return Result.blocked("CLIENT_CONFIGURATION_MISSING");
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            String endpoint = switch (provider) {
                case GOOGLE -> {
                    form.add("token", accessToken);
                    yield "https://oauth2.googleapis.com/revoke";
                }
                case NAVER -> {
                    // https://developers.naver.com/docs/login/api/api.md#3-3-토큰-폐기-요청-oauth20revoke
                    form.add("client_id", naverClientId);
                    form.add("client_secret", naverClientSecret);
                    form.add("token", accessToken);
                    form.add("token_type_hint", "access_token");
                    yield "https://nid.naver.com/oauth2.0/revoke";
                }
                case KAKAO -> {
                    headers.setBearerAuth(accessToken);
                    yield "https://kapi.kakao.com/v1/user/unlink";
                }
                case LOCAL -> throw new IllegalStateException("Local provider cannot require unlink");
            };
            ResponseEntity<String> response = restTemplate.exchange(
                    endpoint, HttpMethod.POST, new HttpEntity<>(form, headers), String.class);
            return classify(response.getStatusCode().value());
        } catch (HttpStatusCodeException exception) {
            return classify(exception.getStatusCode().value());
        } catch (ResourceAccessException exception) {
            return Result.retryable("NETWORK_UNAVAILABLE");
        } catch (Exception exception) {
            log.warn("OAuth unlink could not be requested: memberId={}, provider={}, errorType={}",
                    memberId, provider, exception.getClass().getSimpleName());
            return Result.blocked("REQUEST_CONFIGURATION_ERROR");
        }
    }

    private Result classify(int status) {
        if (status >= 200 && status < 300) return Result.completed();
        String errorType = "REMOTE_HTTP_" + status;
        if (status == 408 || status == 425 || status == 429 || status >= 500) {
            return Result.retryable(errorType);
        }
        // 만료된 토큰도 실제 연결 해제 완료를 입증하지는 못한다. 운영 확인 대상으로 남긴다.
        return Result.blocked(errorType);
    }

    public enum Outcome { COMPLETED, RETRYABLE, BLOCKED }

    public record Result(Outcome outcome, String errorType) {
        public static Result completed() { return new Result(Outcome.COMPLETED, null); }
        public static Result retryable(String errorType) { return new Result(Outcome.RETRYABLE, errorType); }
        public static Result blocked(String errorType) { return new Result(Outcome.BLOCKED, errorType); }
    }
}
