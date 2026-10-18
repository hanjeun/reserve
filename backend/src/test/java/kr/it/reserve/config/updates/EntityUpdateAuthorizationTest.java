package kr.it.reserve.config.updates;

import kr.it.reserve.config.ApiVersionConfiguration;
import kr.it.reserve.config.SecurityConfig;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.oauth2.CustomOAuth2UserService;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationFailureHandler;
import kr.it.reserve.config.oauth2.OAuth2AuthenticationSuccessHandler;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(EntityUpdateController.class)
@Import({SecurityConfig.class, ApiVersionConfiguration.class})
class EntityUpdateAuthorizationTest {
    @Autowired private MockMvc mvc;
    @MockitoBean private TokenProvider tokens;
    @MockitoBean private CustomOAuth2UserService users;
    @MockitoBean private OAuth2AuthenticationSuccessHandler success;
    @MockitoBean private OAuth2AuthenticationFailureHandler failure;
    @MockitoBean private ClientRegistrationRepository registrations;
    @MockitoBean private EntityUpdateStream streams;
    @MockitoBean private org.springframework.data.jpa.mapping.JpaMetamodelMappingContext jpaMappingContext;

    @BeforeEach
    void streams() { when(streams.subscribePublic(any())).thenAnswer(ignored -> new SseEmitter(1_000L)); }

    @Test
    void onlyTheExactPublicGetIsAnonymousAndVersionOneUsesTheSameRule() throws Exception {
        for (String prefix : new String[]{"/api", "/api/v1"}) {
            mvc.perform(get(prefix + "/updates/public/events"))
                    .andExpect(status().isOk()).andExpect(request().asyncStarted())
                    .andExpect(header().string("Cache-Control", "no-store"))
                    .andExpect(header().string("X-Accel-Buffering", "no"));
            mvc.perform(get(prefix + "/updates/events")).andExpect(status().isUnauthorized());
            mvc.perform(get(prefix + "/updates/public/private-data")).andExpect(status().isUnauthorized());
            mvc.perform(post(prefix + "/updates/public/events")).andExpect(status().isUnauthorized());
        }
        mvc.perform(get("/api/v2/updates/public/events")).andExpect(status().isNotFound());
    }
}
