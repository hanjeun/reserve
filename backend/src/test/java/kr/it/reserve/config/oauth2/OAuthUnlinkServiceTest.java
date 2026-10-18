package kr.it.reserve.config.oauth2;

import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

class OAuthUnlinkServiceTest {

    @Test
    void googleTokenIsSentInTheFormBodyInsteadOfTheUrl() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("https://oauth2.googleapis.com/revoke"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Content-Type", MediaType.APPLICATION_FORM_URLENCODED_VALUE))
                .andExpect(content().string("token=secret-token"))
                .andRespond(withSuccess("", MediaType.TEXT_PLAIN));

        OAuthUnlinkService service = new OAuthUnlinkService(restTemplate);

        assertThat(service.unlink(AuthProvider.GOOGLE, "secret-token", 7L)).isTrue();
        server.verify();
    }

    @Test
    void naverUsesTheCurrentRevokeApiWithSecretsOnlyInEncodedFormBody() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("https://nid.naver.com/oauth2.0/revoke"))
                .andExpect(method(HttpMethod.POST))
                .andExpect(header("Content-Type", MediaType.APPLICATION_FORM_URLENCODED_VALUE))
                .andExpect(content().string("client_id=client-id&client_secret=secret%2B%26&token=token%2B%26&token_type_hint=access_token"))
                .andRespond(withSuccess("", MediaType.TEXT_PLAIN));
        OAuthUnlinkService service = new OAuthUnlinkService(restTemplate);
        ReflectionTestUtils.setField(service, "naverClientId", "client-id");
        ReflectionTestUtils.setField(service, "naverClientSecret", "secret+&");

        assertThat(service.unlinkWithResult(AuthProvider.NAVER, "token+&", 8L).outcome())
                .isEqualTo(OAuthUnlinkService.Outcome.COMPLETED);
        server.verify();
    }

    @ParameterizedTest
    @CsvSource({"400,BLOCKED", "401,BLOCKED", "403,BLOCKED", "404,BLOCKED", "408,RETRYABLE",
            "429,RETRYABLE", "500,RETRYABLE", "503,RETRYABLE"})
    void requestAndCredentialErrorsStopWhileTemporaryFailuresRetry(int status, OAuthUnlinkService.Outcome expected) {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("https://oauth2.googleapis.com/revoke"))
                .andRespond(withStatus(HttpStatus.valueOf(status)).body("{\"error\":\"invalid_token\"}"));
        OAuthUnlinkService service = new OAuthUnlinkService(restTemplate);

        OAuthUnlinkService.Result result = service.unlinkWithResult(AuthProvider.GOOGLE, "expired-token", 8L);

        assertThat(result.outcome()).isEqualTo(expected);
        assertThat(result.errorType()).isEqualTo("REMOTE_HTTP_" + status);
        server.verify();
    }

    @Test
    void networkFailuresRetryWithoutKeepingExceptionOrResponseText() {
        RestTemplate restTemplate = new RestTemplate();
        MockRestServiceServer server = MockRestServiceServer.bindTo(restTemplate).build();
        server.expect(requestTo("https://oauth2.googleapis.com/revoke")).andRespond(request -> {
            throw new java.io.IOException("sensitive request context");
        });
        OAuthUnlinkService.Result result = new OAuthUnlinkService(restTemplate)
                .unlinkWithResult(AuthProvider.GOOGLE, "token", 8L);

        assertThat(result).isEqualTo(OAuthUnlinkService.Result.retryable("NETWORK_UNAVAILABLE"));
        server.verify();
    }
}
