package kr.it.reserve.config;

import kr.it.reserve.config.jwt.*;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.repository.MemberRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.*;
import java.util.Optional;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class LoginMethodSessionTest {
    private TokenProvider tokens;
    private Member member;
    private JwtSessionFixture fixture;
    @BeforeEach void setUp() {
        JwtProperties properties = new JwtProperties();
        properties.setIssuer("login-method-test");
        properties.setSecretKey("test-login-method-secret-for-hmac-validation-with-more-than-sixty-four-characters");
        properties.getAccessToken().setExpirationMinutes(30);
        properties.getRefreshToken().setExpirationDays(14);
        member = Member.builder().id(7L).name("owner").email("owner@example.test").role(Role.BUSINESS)
                .provider(AuthProvider.NAVER).providerId("test-subject").password("enabled-password-hash")
                .loginMethodsManaged(true).oauthAuthenticatedAt(LocalDateTime.now(ZoneOffset.UTC).minusMinutes(1)).build();
        fixture = new JwtSessionFixture(member);
        tokens = fixture.tokens;
    }
    @Test void passwordLoginAndRefreshNeverInheritTheMostRecentSocialAuthentication() {
        member.setOauthSecurityRevokedAt(LocalDateTime.now(ZoneOffset.UTC));
        String access = fixture.issue(null).accessToken();
        assertThat(tokens.getLoginMethod(access)).isEqualTo("PASSWORD");
        assertThat(tokens.getOAuthAuthenticationAt(access)).isNull();
        assertThat(tokens.getActiveMemberFromToken(access)).isSameAs(member);
        var inspection = tokens.inspectRefreshToken(tokens.createRefreshJwt(member, null));
        assertThat(inspection.loginMethod()).isEqualTo("PASSWORD");
        assertThat(inspection.oauthAuthenticatedAt()).isNull();
        assertThat(tokens.isLoginSessionCurrent(member, inspection.oauthAuthenticatedAt(), inspection.loginMethod())).isTrue();
        assertThat(tokens.inspectRefreshToken(tokens.createRefreshJwt(member, inspection.oauthAuthenticatedAt())).loginMethod()).isEqualTo("PASSWORD");
    }
    @Test void revokedSocialProofAndRemovedPasswordsCannotAuthenticate() {
        String password = fixture.issue(null).accessToken();
        String oauth = fixture.issue(member.getOauthAuthenticatedAt()).accessToken();
        assertThat(tokens.getLoginMethod(oauth)).isEqualTo("OAUTH");
        member.setOauthSecurityRevokedAt(LocalDateTime.now(ZoneOffset.UTC));
        assertThatThrownBy(() -> tokens.getActiveMemberFromToken(oauth)).isInstanceOf(RuntimeException.class);
        member.setPassword(null);
        assertThatThrownBy(() -> tokens.getActiveMemberFromToken(password)).isInstanceOf(RuntimeException.class);
    }
    @Test void credentialChangesInvalidateBothKindsOfAccessToken() {
        String password = fixture.issue(null).accessToken();
        String oauth = fixture.issue(member.getOauthAuthenticatedAt()).accessToken();
        member.rotateAuthVersion();
        assertThatThrownBy(() -> tokens.getActiveMemberFromToken(password)).isInstanceOf(RuntimeException.class);
        assertThatThrownBy(() -> tokens.getActiveMemberFromToken(oauth)).isInstanceOf(RuntimeException.class);
    }
}
