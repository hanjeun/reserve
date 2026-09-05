package kr.it.reserve.config;

import kr.it.reserve.config.oauth2.OAuth2AuthenticationFailureHandler;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationServiceException;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * OAuth 공급자·내부 예외의 원문이 브라우저 주소와 서버 로그로 새지 않도록 사용자 문구 경계를 고정한다.
 */
class OAuth2FailureMessageSafetyTest {

    private final OAuth2AuthenticationFailureHandler handler = new OAuth2AuthenticationFailureHandler();

    @Test
    @DisplayName("알 수 없는 OAuth 예외 원문은 사용자 리다이렉트 메시지에 포함하지 않는다")
    void unknownExceptionMessageIsReplacedWithGenericCopy() {
        String privateDetail = "private-user@example.com access_token=secret-value";
        AuthenticationServiceException exception = new AuthenticationServiceException(privateDetail);

        String message = ReflectionTestUtils.invokeMethod(handler, "resolveMessage", exception);

        assertThat(message)
                .isEqualTo("소셜 로그인에 실패했습니다. 다시 시도해주세요.")
                .doesNotContain("private-user@example.com", "secret-value");
    }

    @Test
    @DisplayName("이메일 충돌은 예외 원문 대신 허용된 안내 문구만 사용한다")
    void emailConflictUsesAllowlistedCopy() {
        OAuth2AuthenticationException exception = new OAuth2AuthenticationException(
                new OAuth2Error("email_conflict"),
                "GOOGLE account private-user@example.com");

        String message = ReflectionTestUtils.invokeMethod(handler, "resolveMessage", exception);

        assertThat(message)
                .isEqualTo("이미 가입된 이메일입니다. 기존 가입 방식으로 로그인해주세요.")
                .doesNotContain("private-user@example.com", "GOOGLE account");
    }
}
