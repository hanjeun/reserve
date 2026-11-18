package kr.it.reserve.config;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.member.entity.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletResponse;
import java.time.Duration;
import java.util.Base64;
import static org.assertj.core.api.Assertions.*;

class LoginPersistenceTest {
    private JwtSessionFixture fixture() {
        return new JwtSessionFixture(Member.builder().id(1L).role(Role.USER).provider(AuthProvider.LOCAL)
                .name("합성 회원").email("fixture@example.test").password("synthetic-hash").build());
    }
    @ParameterizedTest
    @CsvSource({"USER,true,720,2160", "BUSINESS,true,336,720", "ADMIN,true,336,720",
            "USER,false,1,720", "BUSINESS,false,1,720", "ADMIN,false,1,720"})
    void newSessionsUseTheSelectedLifetimeWithoutChangingTheRoleBoundary(
            Role role, boolean persistent, long idleHours, long absoluteHours) {
        var fixture = fixture();
        fixture.member.setRole(role);
        var issued = fixture.tokens.issueVerifiedSession(fixture.member, null, "PASSKEY", persistent);
        var row = fixture.row(issued.refreshToken());
        assertThat(issued.refreshMaxAge()).isEqualTo(Duration.ofHours(idleHours));
        assertThat(row.getAbsoluteExpiresAt()).isEqualTo(row.getCreatedAt().plusHours(absoluteHours));
        fixture.setNow(fixture.startedAt.plus(Duration.ofMinutes(35)));
        var rotated = fixture.service.refresh(issued.refreshToken());
        assertThat(rotated.refreshMaxAge()).isEqualTo(Duration.ofHours(idleHours));
        assertThat(rotated.persistent()).isEqualTo(persistent);
    }

    @Test void rememberedUserMustLogInAgainAtTheOriginalNinetyDayDeadline() {
        var fixture = fixture();
        String token = fixture.tokens.issueSession(fixture.member, null, true).refreshToken();
        for (int day : new int[]{29, 58, 87}) {
            fixture.setNow(fixture.startedAt.plus(Duration.ofDays(day)));
            token = fixture.service.refresh(token).refreshToken();
        }
        assertThat(fixture.claims(token).getExpiration().toInstant()).isEqualTo(fixture.startedAt.plus(Duration.ofDays(90)));
        fixture.setNow(fixture.startedAt.plus(Duration.ofDays(90)));
        String expired = token;
        assertThatThrownBy(() -> fixture.service.refresh(expired)).isInstanceOf(kr.it.reserve.global.error.AuthException.class);
        assertThat(fixture.row(expired)).isNull();
    }

    @Test void restoringAPublicBrowserCookieAfterAnHourCannotRefreshTheSession() {
        var fixture = fixture();
        var issued = fixture.tokens.issueSession(fixture.member, null, false);
        String sid = fixture.tokens.getSessionId(issued.accessToken());
        fixture.setNow(fixture.startedAt.plus(Duration.ofHours(1)));
        assertThat(fixture.tokens.isDeviceSessionCurrent(sid, fixture.member.getId())).isFalse();
        assertThatThrownBy(() -> fixture.service.refresh(issued.refreshToken())).isInstanceOf(kr.it.reserve.global.error.AuthException.class);
    }

    @Test void previouslyIssuedExplicitPreferenceKeepsItsOriginalWindow() {
        var fixture = fixture();
        fixture.properties.setRememberedUserIdleLifetime(Duration.ofDays(14));
        fixture.properties.setRememberedUserAbsoluteLifetime(Duration.ofDays(30));
        var existing = fixture.tokens.issueSession(fixture.member, null, true);
        fixture.properties.setRememberedUserIdleLifetime(Duration.ofDays(30));
        fixture.properties.setRememberedUserAbsoluteLifetime(Duration.ofDays(90));
        fixture.setNow(fixture.startedAt.plus(Duration.ofDays(2)));
        var refreshed = fixture.service.refresh(existing.refreshToken());
        assertThat(refreshed.refreshMaxAge()).isEqualTo(Duration.ofDays(14));
        assertThat(fixture.tokens.inspectRefreshToken(refreshed.refreshToken()).absoluteExpiresAt())
                .isEqualTo(fixture.tokens.inspectRefreshToken(existing.refreshToken()).absoluteExpiresAt());
    }

    @ParameterizedTest @org.junit.jupiter.params.provider.EnumSource(value = Role.class, names = {"BUSINESS", "ADMIN"})
    void promotionCannotUseAnOrdinaryMembersExtendedSession(Role role) {
        var fixture = fixture();
        var issued = fixture.tokens.issueVerifiedSession(fixture.member, null, "PASSKEY", true);
        String sid = fixture.tokens.getSessionId(issued.accessToken());
        fixture.member.setRole(role);
        assertThatThrownBy(() -> fixture.tokens.verifyAuthentication(issued.accessToken()))
                .isInstanceOf(kr.it.reserve.global.error.AuthException.class);
        assertThat(fixture.tokens.isDeviceSessionCurrent(sid, fixture.member.getId())).isFalse();
        assertThatThrownBy(() -> fixture.service.refresh(issued.refreshToken())).isInstanceOf(kr.it.reserve.global.error.AuthException.class);
        assertThat(fixture.row(issued.refreshToken())).isNull();
    }

    @ParameterizedTest @ValueSource(booleans = {false, true})
    void signedPreferenceSurvivesRefreshAndThePreviousTokenGraceResponse(boolean persistent) {
        var fixture = fixture();
        var first = fixture.tokens.issueSession(fixture.member, null, persistent);
        assertThat(first.persistent()).isEqualTo(persistent);
        assertThat(fixture.claims(first.refreshToken()).get("persistent_login", Boolean.class)).isEqualTo(persistent);
        assertThat(fixture.tokens.verifyAuthentication(first.accessToken()).persistent()).isEqualTo(persistent);
        var rotated = fixture.service.refresh(first.refreshToken());
        var grace = fixture.service.refresh(first.refreshToken());
        assertThat(rotated.persistent()).isEqualTo(persistent);
        assertThat(grace.persistent()).isEqualTo(persistent);
        assertThat(grace.refreshToken()).isEqualTo(rotated.refreshToken());
        assertThat(fixture.claims(rotated.refreshToken()).get("persistent_login", Boolean.class)).isEqualTo(persistent);
        assertThat(fixture.tokens.verifyAuthentication(rotated.accessToken()).persistent()).isEqualTo(persistent);
        assertThat(fixture.service.refresh(rotated.refreshToken()).persistent()).isEqualTo(persistent);
        assertThat(fixture.row(rotated.refreshToken()).getAbsoluteExpiresAt())
                .isEqualTo(fixture.tokens.inspectRefreshToken(first.refreshToken()).absoluteExpiresAt());
    }
    @Test void legacySessionsKeepTheirOriginalCookiePolicyAndExactRefreshReconstruction() {
        var fixture = fixture();
        var first = fixture.issue(null);
        assertThat(fixture.claims(first.refreshToken())).doesNotContainKey("persistent_login");
        assertThat(fixture.tokens.inspectRefreshToken(first.refreshToken()).persistence()).isNull();
        var rotated = fixture.service.refresh(first.refreshToken());
        assertThat(rotated.persistent()).isTrue();
        assertThat(fixture.claims(rotated.refreshToken())).doesNotContainKey("persistent_login");
        assertThat(fixture.service.refresh(first.refreshToken()).refreshToken()).isEqualTo(rotated.refreshToken());
    }
    @Test void changingTheUnsignedPayloadCannotTurnOnPersistence() {
        var fixture = fixture();
        var first = fixture.tokens.issueSession(fixture.member, null, false);
        String[] parts = first.refreshToken().split("\\.");
        String body = new String(Base64.getUrlDecoder().decode(parts[1]), java.nio.charset.StandardCharsets.UTF_8)
                .replace("\"persistent_login\":false", "\"persistent_login\":true");
        String tampered = parts[0] + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(body.getBytes(java.nio.charset.StandardCharsets.UTF_8)) + "." + parts[2];
        assertThat(fixture.tokens.inspectRefreshToken(tampered).state()).isEqualTo(TokenProvider.RefreshTokenState.INVALID);
        assertThatThrownBy(() -> fixture.service.refresh(tampered)).isInstanceOf(RuntimeException.class);
        assertThat(fixture.service.refresh(first.refreshToken()).persistent()).isFalse();
    }
    @ParameterizedTest @ValueSource(booleans = {false, true})
    void cookiePersistenceIsAppliedToBothTokensWithoutChangingTheirSecurityAttributes(boolean persistent) {
        var response = new MockHttpServletResponse();
        new CookieUtil("prod").addAuthCookies(response, "synthetic-access", "synthetic-refresh", 1800, 1209600, persistent);
        var credentials = response.getHeaders("Set-Cookie").stream().filter(value -> !value.startsWith("refresh_token=;")).toList();
        assertThat(credentials).hasSize(3);
        for (String value : credentials) {
            assertThat(value).contains("HttpOnly", "Secure", "SameSite=Lax").doesNotContain("Domain=");
            if (persistent) assertThat(value).contains("Max-Age=");
            else assertThat(value).doesNotContain("Max-Age=", "Expires=");
        }
        assertThat(response.getHeaders("Set-Cookie")).anyMatch(value -> value.startsWith("refresh_token=;") && value.contains("Max-Age=0"));
    }
}
