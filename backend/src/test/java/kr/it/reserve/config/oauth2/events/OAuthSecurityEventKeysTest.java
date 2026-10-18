package kr.it.reserve.config.oauth2.events;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.nimbusds.jose.jwk.JWKSet;
import com.nimbusds.jose.jwk.RSAKey;
import kr.it.reserve.member.entity.AuthProvider;
import org.junit.jupiter.api.Test;

import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPublicKey;
import java.time.Clock;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class OAuthSecurityEventKeysTest {
    private static final String DISCOVERY = "https://accounts.google.com/.well-known/risc-configuration";
    private static final String JWKS = "https://www.googleapis.com/oauth2/v3/certs";

    @Test
    void fetchesOnlyOfficialDiscoveryAndJwksAndCachesTheKey() throws Exception {
        OAuthSecurityEventMetadataClient client = mock(OAuthSecurityEventMetadataClient.class);
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        KeyPair pair = generator.generateKeyPair();
        RSAKey key = new RSAKey.Builder((RSAPublicKey) pair.getPublic()).keyID("current-key").build();
        when(client.read(DISCOVERY, 32_768)).thenReturn(
                "{\"issuer\":\"https://accounts.google.com\",\"jwks_uri\":\"https://www.googleapis.com/oauth2/v3/certs\"}");
        when(client.read(JWKS, 262_144)).thenReturn(new JWKSet(key).toString());
        OAuthSecurityEventKeys keys = new OAuthSecurityEventKeys(new ObjectMapper(), client, Clock.systemUTC());

        assertThat(keys.resolve(AuthProvider.GOOGLE, "current-key").key()).isEqualTo(pair.getPublic());
        assertThat(keys.resolve(AuthProvider.GOOGLE, "current-key").key()).isEqualTo(pair.getPublic());
        assertThatThrownBy(() -> keys.resolve(AuthProvider.GOOGLE, "attacker-supplied-kid"))
                .isInstanceOf(OAuthSecurityEventException.class).hasMessage("invalid_key");
        verify(client, times(1)).read(DISCOVERY, 32_768);
        verify(client, times(1)).read(JWKS, 262_144);
        verifyNoMoreInteractions(client);
    }

    @Test
    void unexpectedDiscoveryKeyUrlIsNotFollowed() {
        OAuthSecurityEventMetadataClient client = mock(OAuthSecurityEventMetadataClient.class);
        String kakao = "https://kauth.kakao.com/.well-known/ssf-configuration";
        when(client.read(kakao, 32_768)).thenReturn(
                "{\"issuer\":\"https://kauth.kakao.com\",\"jwks_uri\":\"http://127.0.0.1/private\"}");
        OAuthSecurityEventKeys keys = new OAuthSecurityEventKeys(new ObjectMapper(), client, Clock.systemUTC());

        assertThatThrownBy(() -> keys.resolve(AuthProvider.KAKAO, "key"))
                .isInstanceOf(OAuthSecurityEventException.class).hasMessage("temporarily_unavailable");
        verify(client).read(kakao, 32_768);
        verifyNoMoreInteractions(client);
    }

    @Test
    void failedColdFetchBacksOffInsteadOfFetchingAgainForEveryUnsignedRequest() {
        OAuthSecurityEventMetadataClient client = mock(OAuthSecurityEventMetadataClient.class);
        when(client.read(DISCOVERY, 32_768)).thenThrow(OAuthSecurityEventException.unavailable());
        OAuthSecurityEventKeys keys = new OAuthSecurityEventKeys(new ObjectMapper(), client, Clock.systemUTC());

        for (int attempt = 0; attempt < 3; attempt++) {
            assertThatThrownBy(() -> keys.resolve(AuthProvider.GOOGLE, "key"))
                    .isInstanceOf(OAuthSecurityEventException.class).hasMessage("temporarily_unavailable");
        }
        verify(client, times(1)).read(DISCOVERY, 32_768);
        verifyNoMoreInteractions(client);
    }

    @Test
    void anEmptyDiscoveryIsATemporaryMetadataFailureRatherThanAnInvalidUserToken() {
        OAuthSecurityEventMetadataClient client = mock(OAuthSecurityEventMetadataClient.class);
        when(client.read(DISCOVERY, 32_768)).thenReturn("");
        OAuthSecurityEventKeys keys = new OAuthSecurityEventKeys(new ObjectMapper(), client, Clock.systemUTC());

        assertThatThrownBy(() -> keys.resolve(AuthProvider.GOOGLE, "key"))
                .isInstanceOf(OAuthSecurityEventException.class).hasMessage("temporarily_unavailable");
    }
}
