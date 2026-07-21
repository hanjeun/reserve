package kr.it.reserve.config.oauth2;

import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
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
    private String naverClientId;

    @Value("${spring.security.oauth2.client.registration.naver.client-secret:}")
    private String naverClientSecret;

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
            return true; // 혹은 필요에 따라 throw new AuthException
        }

        try {
            return switch (member.getProvider()) {
                case NAVER -> unlinkNaver(accessToken);
                case KAKAO -> unlinkKakao(accessToken);
                case GOOGLE -> unlinkGoogle(accessToken);
                default -> true;
            };
        } catch (Exception e) {
            log.error("OAuth unlink error: {}", e.getMessage());
            // 탈퇴가 중단되면 안 되므로 로그만 남기고 true 반환하는 정책 유지
            return true;
        }
    }

    /**
     * Google 연동 해제
     * https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke
     */
    private boolean unlinkGoogle(String accessToken) {
        String revokeUrl = "https://oauth2.googleapis.com/revoke?token=" + accessToken;

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

            HttpEntity<String> entity = new HttpEntity<>("", headers);

            ResponseEntity<String> response = restTemplate.exchange(
                    revokeUrl,
                    HttpMethod.POST,
                    entity,
                    String.class
            );

            log.info("Google unlink response: status={}", response.getStatusCode());
            return response.getStatusCode().is2xxSuccessful();

        } catch (Exception e) {
            log.error("Google unlink failed: {}", e.getMessage());
            // 토큰이 이미 만료되었거나 해제된 경우에도 탈퇴는 진행
            return true;
        }
    }

    /**
     * Naver 연동 해제
     * https://developers.naver.com/docs/login/devguide/devguide.md#5-3-%EB%84%A4%EC%9D%B4%EB%B2%84-%EB%A1%9C%EA%B7%B8%EC%9D%B8-%EC%97%B0%EB%8F%99-%ED%95%B4%EC%A0%9C
     */
    private boolean unlinkNaver(String accessToken) {
        String unlinkUrl = String.format(
                "https://nid.naver.com/oauth2.0/token?grant_type=delete&client_id=%s&client_secret=%s&access_token=%s&service_provider=NAVER",
                naverClientId, naverClientSecret, accessToken
        );

        try {
            ResponseEntity<String> response = restTemplate.getForEntity(unlinkUrl, String.class);

            log.info("Naver unlink response: status={}, body={}", response.getStatusCode(), response.getBody());
            return response.getStatusCode().is2xxSuccessful();

        } catch (Exception e) {
            log.error("Naver unlink failed: {}", e.getMessage());
            // 토큰이 이미 만료되었거나 해제된 경우에도 탈퇴는 진행
            return true;
        }
    }

    /**
     * Kakao 연동 해제
     * https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api#unlink
     */
    private boolean unlinkKakao(String accessToken) {
        String unlinkUrl = "https://kapi.kakao.com/v1/user/unlink";

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.setBearerAuth(accessToken);
            headers.setContentType(MediaType.APPLICATION_FORM_URLENCODED);

            HttpEntity<String> entity = new HttpEntity<>("", headers);

            ResponseEntity<String> response = restTemplate.exchange(
                    unlinkUrl,
                    HttpMethod.POST,
                    entity,
                    String.class
            );

            log.info("Kakao unlink response: status={}, body={}", response.getStatusCode(), response.getBody());
            return response.getStatusCode().is2xxSuccessful();

        } catch (Exception e) {
            log.error("Kakao unlink failed: {}", e.getMessage());
            // 토큰이 이미 만료되었거나 해제된 경우에도 탈퇴는 진행
            return true;
        }
    }
}
