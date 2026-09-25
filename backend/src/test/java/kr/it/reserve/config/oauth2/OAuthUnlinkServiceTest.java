package kr.it.reserve.config.oauth2;

import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

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
}
