package kr.it.reserve.member;

import jakarta.persistence.EntityManager;
import jakarta.servlet.http.Cookie;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.oauth2.OAuth2UserInfo;
import kr.it.reserve.config.oauth2.subject.*;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.repository.*;
import kr.it.reserve.member.service.LoginMethodService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.util.UriComponentsBuilder;

import java.time.*;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class LoginMethodServiceTest {
    private static final LocalDateTime NOW = LocalDateTime.of(2026, 10, 22, 0, 0);
    private final MemberRepository members = mock(MemberRepository.class);
    private final LoginMethodChallengeRepository challenges = mock(LoginMethodChallengeRepository.class);
    private final OAuthSubjectSecurityService subjects = mock(OAuthSubjectSecurityService.class);
    private final OAuthSubjectSecurity subject = mock(OAuthSubjectSecurity.class);
    private final RefreshTokenRepository refresh = mock(RefreshTokenRepository.class);
    private final PasswordResetTokenRepository resets = mock(PasswordResetTokenRepository.class);
    private final EmailService emails = mock(EmailService.class);
    private final TokenProvider tokens = mock(TokenProvider.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private final Map<String, LoginMethodChallenge> rows = new HashMap<>();
    private LoginMethodService service;
    private Member member;

    @BeforeEach void setUp() {
        service = new LoginMethodService(members, challenges, subjects, refresh, resets, emails, tokens,
                mock(PwnedPasswordChecker.class), mock(ApplicationEventPublisher.class));
        ReflectionTestUtils.setField(service, "passwords", encoder);
        ReflectionTestUtils.setField(service, "entityManager", mock(EntityManager.class));
        member = Member.builder().id(7L).name("사업자 기존 이름").email("owner@naver.com").role(Role.BUSINESS)
                .profileImage("/original-photo.png").provider(AuthProvider.LOCAL).password(encoder.encode("Original123!")).build();
        when(subjects.now()).thenReturn(NOW);
        when(subjects.lock(any(), any())).thenReturn(subject);
        when(subject.acceptsAuthentication(any())).thenReturn(true);
        when(members.findActiveByIdForUpdate(7L)).thenReturn(Optional.of(member));
        when(members.findByIdAndDeletedAtIsNull(7L)).thenReturn(Optional.of(member));
        when(tokens.getActiveMemberFromToken("test-session")).thenReturn(member);
        when(tokens.getUserId("test-session")).thenReturn(7L);
        when(members.findByEmail(anyString())).thenReturn(Optional.empty());
        when(members.findActiveIdsByProviderAndProviderIdForUpdate(anyString(), anyString())).thenAnswer(call ->
                member.isOAuthUser() && member.getProvider().name().equals(call.getArgument(0))
                        && Objects.equals(member.getProviderId(), call.getArgument(1)) ? List.of(7L) : List.of());
        when(challenges.findByMemberIdAndPurpose(anyLong(), any())).thenAnswer(call -> rows.values().stream()
                .filter(row -> row.getMember().getId().equals(call.getArgument(0)) && row.getPurpose() == call.getArgument(1)).findFirst());
        doAnswer(call -> { rows.remove(((LoginMethodChallenge) call.getArgument(0)).getId()); return null; }).when(challenges).delete(any());
        when(challenges.saveAndFlush(any())).thenAnswer(call -> { LoginMethodChallenge row = call.getArgument(0); rows.put(row.getId(), row); return row; });
        when(challenges.findById(anyString())).thenAnswer(call -> Optional.ofNullable(rows.get(call.getArgument(0))));
        when(challenges.findForUpdate(anyString())).thenAnswer(call -> Optional.ofNullable(rows.get(call.getArgument(0))));
    }

    @ParameterizedTest
    @CsvSource({"NAVER,auth_type,reauthenticate", "KAKAO,prompt,login", "GOOGLE,prompt,select_account"})
    void reauthenticationAddsTheSupportedProviderInteractionToTheActualRedirectUri(
            AuthProvider provider, String parameter, String expected) {
        member.setProvider(provider);
        member.setProviderId("existing-subject");
        var request = new MockHttpServletRequest();
        request.setCookies(new Cookie("access_token", "test-session"));
        String url = service.beginOAuth(member, provider, null, true, request);
        request.setParameter("account_link", url.substring(url.indexOf('=') + 1));
        var original = OAuth2AuthorizationRequest.authorizationCode().authorizationUri("https://provider.example/authorize")
                .clientId("test-client").redirectUri("https://app.reserve.it.kr/login/oauth2/code/" + provider.name().toLowerCase(Locale.ROOT))
                .state("bound-state").scope("email", "profile")
                .attributes(values -> values.put("registration_id", provider.name().toLowerCase(Locale.ROOT)))
                .additionalParameters(values -> {
                    values.put("code_challenge", "test-pkce-challenge");
                    values.put("code_challenge_method", "S256");
                    if (provider != AuthProvider.NAVER) values.put("prompt", "none");
                    if (provider == AuthProvider.GOOGLE) values.put("login_hint", "owner@example.test");
                }).build();
        var bound = service.bindOAuth(request, original);
        var query = UriComponentsBuilder.fromUriString(bound.getAuthorizationRequestUri()).build().getQueryParams();
        assertThat(bound.getAdditionalParameters()).containsEntry(parameter, expected);
        assertThat(query.get(parameter)).containsExactly(expected);
        assertThat(query.getFirst("state")).isEqualTo("bound-state");
        assertThat(query.getFirst("code_challenge")).isEqualTo("test-pkce-challenge");
        assertThat(bound.getRedirectUri()).isEqualTo(original.getRedirectUri());
        assertThat(bound.getScopes()).isEqualTo(original.getScopes());
        if (provider == AuthProvider.GOOGLE) assertThat(query).doesNotContainKey("login_hint");
    }

    @ParameterizedTest
    @EnumSource(value = AuthProvider.class, names = {"NAVER", "KAKAO", "GOOGLE"})
    void aRegularLoginKeepsItsExistingProviderInteraction(AuthProvider provider) {
        var original = OAuth2AuthorizationRequest.authorizationCode().authorizationUri("https://provider.example/authorize")
                .clientId("test-client").redirectUri("https://app.reserve.it.kr/login/oauth2/code/" + provider.name().toLowerCase(Locale.ROOT))
                .state("ordinary-login").build();
        assertThat(service.bindOAuth(new MockHttpServletRequest(), original)).isSameAs(original);
    }

    private MockHttpServletRequest flow(boolean reauthenticate) {
        return flow(AuthProvider.NAVER, reauthenticate);
    }
    private MockHttpServletRequest flow(AuthProvider provider, boolean reauthenticate) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setCookies(new Cookie("access_token", "test-session"));
        String url = service.beginOAuth(member, provider, "Original123!", reauthenticate, request);
        request.setParameter("account_link", url.substring(url.indexOf('=') + 1));
        var authorization = OAuth2AuthorizationRequest.authorizationCode().authorizationUri("https://nid.naver.com/oauth2.0/authorize")
                .clientId("test-client").redirectUri("https://app.reserve.it.kr/login/oauth2/code/" + provider.name().toLowerCase(Locale.ROOT))
                .state("bound-state").attributes(values -> values.put("registration_id", provider.name().toLowerCase(Locale.ROOT))).build();
        service.bindOAuth(request, authorization);
        request.setParameter("state", "bound-state");
        return request;
    }
    private Member complete(MockHttpServletRequest request, String subjectId) {
        return complete(request, AuthProvider.NAVER, subjectId, member.getEmail(), Map.of());
    }
    private Member complete(MockHttpServletRequest request, AuthProvider provider, String subjectId, String email, Map<String, Object> attributes) {
        OAuth2UserInfo info = mock(OAuth2UserInfo.class);
        when(info.getProviderId()).thenReturn(subjectId);
        when(info.getEmail()).thenReturn(email);
        when(info.getAttributes()).thenReturn(attributes);
        return service.completeOAuth(request, provider, info, "test-provider-token", NOW,
                NOW.plusHours(1).toInstant(ZoneOffset.UTC));
    }
    private void socialOnly() {
        member.setProvider(AuthProvider.NAVER); member.setProviderId("naver-owner");
        member.setPassword(null); member.setOauthAuthenticatedAt(NOW.minusSeconds(30));
    }
    private String sentCode() {
        ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
        verify(emails).sendLoginMethodVerificationEmail(anyString(), code.capture());
        return code.getValue();
    }

    @Test void linkingKeepsTheExistingOwnerAndProfileAndRevokesPreviousSessions() {
        String previousHash = member.getPassword();
        assertThat(complete(flow(false), "naver-owner")).isSameAs(member);
        assertThat(member.getId()).isEqualTo(7L);
        assertThat(member.getRole()).isEqualTo(Role.BUSINESS);
        assertThat(member.getName()).isEqualTo("사업자 기존 이름");
        assertThat(member.getEmail()).isEqualTo("owner@naver.com");
        assertThat(member.getProfileImage()).isEqualTo("/original-photo.png");
        assertThat(member.getPassword()).isEqualTo(previousHash);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.NAVER);
        assertThat(member.isLoginMethodsManaged()).isTrue();
        assertThat(member.getAuthVersion()).isEqualTo(1);
        verify(refresh).deleteByMemberId(7L);
        verify(resets).invalidateForEmail("owner@naver.com");
        verify(members, never()).save(any());
    }
    @Test void linkingRequiresTheCurrentPassword() {
        assertThatThrownBy(() -> service.beginOAuth(member, AuthProvider.NAVER, "wrong", false, new MockHttpServletRequest()))
                .isInstanceOf(MemberException.class);
        assertThat(rows).isEmpty();
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
    }
    @Test void onlyTheMatchingEmailProviderCanStartLinking() {
        var allowed = Map.of("owner@naver.com", AuthProvider.NAVER, "owner@gmail.com", AuthProvider.GOOGLE,
                "owner@kakao.com", AuthProvider.KAKAO, "owner@daum.net", AuthProvider.KAKAO, "owner@hanmail.net", AuthProvider.KAKAO);
        allowed.forEach((email, provider) -> {
            member.setEmail(email);
            assertThat(service.status(member, null).linkableSocialProvider()).isEqualTo(provider);
            AuthProvider wrong = provider == AuthProvider.NAVER ? AuthProvider.GOOGLE : AuthProvider.NAVER;
            assertThatThrownBy(() -> service.beginOAuth(member, wrong, "Original123!", false, new MockHttpServletRequest()))
                    .isInstanceOf(MemberException.class).hasMessage("현재 이메일에 해당하는 소셜 계정만 연결할 수 있어요.");
        });
        for (String email : List.of("owner@example.test", "owner@naver.com.evil.test", "owner@googlemail.com")) {
            member.setEmail(email);
            assertThat(service.status(member, null).linkableSocialProvider()).isNull();
            assertThatThrownBy(() -> service.beginOAuth(member, AuthProvider.GOOGLE, "Original123!", false, new MockHttpServletRequest()))
                    .isInstanceOf(MemberException.class);
        }
        assertThat(rows).isEmpty();
        socialOnly();
        assertThat(service.status(member, NOW).linkableSocialProvider()).isNull();
    }
    @Test void linkingRequiresTheSameEmailAndDoesNotChangeTheMemberOnMismatch() {
        MockHttpServletRequest request = flow(false);
        assertThatThrownBy(() -> complete(request, AuthProvider.NAVER, "another-owner", "different@naver.com", Map.of()))
                .isInstanceOfSatisfying(OAuth2AuthenticationException.class,
                        error -> assertThat(error.getError().getErrorCode()).isEqualTo("login_method_email_mismatch"));
        assertThat(member.getEmail()).isEqualTo("owner@naver.com");
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(member.getAuthVersion()).isZero();
        assertThat(rows.values()).allMatch(row -> !row.isConsumed());
        verifyNoInteractions(refresh);
    }
    @Test void missingEmailAndChangedEmailProviderCannotCompleteALink() {
        assertThatThrownBy(() -> complete(flow(false), AuthProvider.NAVER, "owner", null, Map.of()))
                .isInstanceOf(OAuth2AuthenticationException.class);
        MockHttpServletRequest request = flow(false);
        member.setEmail("owner@gmail.com");
        assertThatThrownBy(() -> complete(request, "owner")).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(member.getAuthVersion()).isZero();
    }
    @Test void googleLinkRequiresAVerifiedMatchingEmail() {
        member.setEmail("owner@gmail.com");
        assertThatThrownBy(() -> complete(flow(AuthProvider.GOOGLE, false), AuthProvider.GOOGLE, "google-owner", member.getEmail(), Map.of("email_verified", false)))
                .isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(complete(flow(AuthProvider.GOOGLE, false), AuthProvider.GOOGLE, "google-owner", "Owner@Gmail.com", Map.of("email_verified", true))).isSameAs(member);
        assertThat(member.getEmail()).isEqualTo("owner@gmail.com");
    }
    @Test void kakaoLinkRequiresBothEmailValidityAndVerification() {
        member.setEmail("owner@kakao.com");
        for (var flags : List.of(Map.of("is_email_valid", false, "is_email_verified", true),
                Map.of("is_email_valid", true, "is_email_verified", false), Map.of())) {
            assertThatThrownBy(() -> complete(flow(AuthProvider.KAKAO, false), AuthProvider.KAKAO, "kakao-owner", member.getEmail(), Map.of("kakao_account", flags)))
                    .isInstanceOf(OAuth2AuthenticationException.class);
            assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
        }
        complete(flow(AuthProvider.KAKAO, false), AuthProvider.KAKAO, "kakao-owner", member.getEmail(),
                Map.of("kakao_account", Map.of("is_email_valid", true, "is_email_verified", true)));
        assertThat(member.getProvider()).isEqualTo(AuthProvider.KAKAO);
    }
    @Test void anIdentityAlreadyOwnedByAnotherMemberIsNotMerged() {
        MockHttpServletRequest request = flow(false);
        when(members.findActiveIdsByProviderAndProviderIdForUpdate("NAVER", "naver-owner")).thenReturn(List.of(9L));
        assertThatThrownBy(() -> complete(request, "naver-owner")).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(member.getAuthVersion()).isZero();
    }
    @Test void oauthStateAndOneTimeConsumptionAreRequired() {
        MockHttpServletRequest invalid = flow(false);
        invalid.setParameter("state", "different-state");
        assertThatThrownBy(() -> complete(invalid, "naver-owner")).isInstanceOf(OAuth2AuthenticationException.class);
        LoginMethodService.clearFlow(invalid);
        MockHttpServletRequest request = flow(false);
        complete(request, "naver-owner");
        MockHttpServletRequest replay = request;
        assertThatThrownBy(() -> complete(replay, "naver-owner")).isInstanceOf(OAuth2AuthenticationException.class);
    }
    @Test void aChangedBrowserAccountCannotCompleteTheOldLink() {
        MockHttpServletRequest request = flow(false);
        when(tokens.getActiveMemberFromToken("test-session")).thenReturn(Member.builder().id(9L).build());
        when(members.findActiveByIdForUpdate(9L)).thenReturn(Optional.of(Member.builder().id(9L).build()));
        assertThatThrownBy(() -> complete(request, "naver-owner")).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
    }
    @Test void expiredOrSessionRotatedChallengesCannotLink() {
        MockHttpServletRequest expired = flow(false);
        when(subjects.now()).thenReturn(NOW.plusMinutes(5));
        assertThatThrownBy(() -> complete(expired, "naver-owner")).isInstanceOf(OAuth2AuthenticationException.class);
        when(subjects.now()).thenReturn(NOW);
        MockHttpServletRequest request = flow(false);
        member.rotateAuthVersion();
        MockHttpServletRequest rotated = request;
        assertThatThrownBy(() -> complete(rotated, "naver-owner")).isInstanceOf(OAuth2AuthenticationException.class);
    }
    @Test void loggingOutCancelsAnInflightLink() {
        MockHttpServletRequest request = flow(false);
        service.cancelOAuth(request);
        assertThatThrownBy(() -> complete(request, "naver-owner")).isInstanceOf(OAuth2AuthenticationException.class);
    }
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {true, false})
    void logoutAtAccessExpiryCancelsTheCallbackThatAlreadyReadItsBrowserIdentity(boolean expiredCookiePresent) {
        MockHttpServletRequest request = flow(false);
        request.setCookies(new Cookie("access_token", "test-session"), new Cookie("refresh_token", "test-refresh"));
        when(tokens.inspectRefreshToken("test-refresh")).thenReturn(new TokenProvider.RefreshTokenInspection(
                TokenProvider.RefreshTokenState.VALID, 7L, 0, null, "PASSWORD", UUID.randomUUID().toString(),
                0, UUID.randomUUID().toString(), NOW.plusDays(30)));
        when(subjects.lock(AuthProvider.NAVER, "naver-owner")).thenAnswer(call -> {
            // 콜백의 브라우저 신원을 확인한 뒤 기다리는 동안 액세스 자격증명이 만료된 상황이다.
            request.setCookies(expiredCookiePresent
                    ? new Cookie[]{new Cookie("access_token", "test-session"), new Cookie("refresh_token", "test-refresh")}
                    : new Cookie[]{new Cookie("refresh_token", "test-refresh")});
            when(tokens.getUserId("test-session")).thenThrow(new io.jsonwebtoken.ExpiredJwtException(
                    mock(io.jsonwebtoken.Header.class), mock(io.jsonwebtoken.Claims.class), "Synthetic expired access"));
            service.cancelOAuth(request);
            request.getSession(false).invalidate();
            return subject;
        });
        assertThatThrownBy(() -> complete(request, "naver-owner")).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(rows.values()).allMatch(LoginMethodChallenge::isConsumed);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"foreign-member", "wrong-purpose", "invalid-signature", "legacy"})
    void missingAccessDoesNotCancelAFlowWithUntrustedOrForeignRefreshProof(String kind) {
        MockHttpServletRequest request = flow(false);
        var cryptography = new kr.it.reserve.config.JwtSessionFixture(member);
        var pair = cryptography.issue(null);
        String presented = switch (kind) {
            case "foreign-member" -> new kr.it.reserve.config.JwtSessionFixture(Member.builder().id(9L)
                    .provider(AuthProvider.LOCAL).password("synthetic-hash").role(Role.USER).build()).issue(null).refreshToken();
            case "wrong-purpose" -> pair.accessToken();
            case "invalid-signature" -> {
                String value = pair.refreshToken();
                int signature = value.lastIndexOf('.') + 1;
                yield value.substring(0, signature) + (value.charAt(signature) == 'A' ? 'B' : 'A') + value.substring(signature + 1);
            }
            case "legacy" -> io.jsonwebtoken.Jwts.builder().issuer(cryptography.properties.getIssuer())
                    .claim("purpose", "REFRESH").claim("id", 7L)
                    .expiration(java.util.Date.from(cryptography.startedAt.plusSeconds(3600)))
                    .signWith(io.jsonwebtoken.security.Keys.hmacShaKeyFor(
                            kr.it.reserve.config.JwtSessionFixture.SECRET.getBytes(java.nio.charset.StandardCharsets.UTF_8)),
                            io.jsonwebtoken.Jwts.SIG.HS512).compact();
            default -> throw new IllegalArgumentException("Unsupported proof fixture");
        };
        request.setCookies(new Cookie("refresh_token", presented));
        when(tokens.inspectRefreshToken(presented)).thenReturn(cryptography.tokens.inspectRefreshToken(presented));
        service.cancelOAuth(request);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(member.getAuthVersion()).isZero();
        assertThat(rows.values()).allMatch(row -> !row.isConsumed());
    }

    @Test void reauthenticationCannotSwitchToAnotherSocialIdentity() {
        socialOnly();
        MockHttpServletRequest request = flow(true);
        assertThatThrownBy(() -> complete(request, "another-naver-subject")).isInstanceOf(OAuth2AuthenticationException.class);
        assertThat(member.getProviderId()).isEqualTo("naver-owner");
    }
    @Test void passwordSetupRequiresFreshSocialProofAndAnEmailCodeAndPreservesMembership() {
        socialOnly();
        var issued = service.sendPasswordCode(member, NOW.minusSeconds(30), "Owner@Example.test");
        String code = sentCode();
        assertThat(rows.get(issued.challengeId()).getCodeHash()).isNotEqualTo(code);
        service.setPassword(member, NOW.minusSeconds(30), issued.challengeId(), code, "NewPassword123!", "NewPassword123!");
        assertThat(encoder.matches("NewPassword123!", member.getPassword())).isTrue();
        assertThat(member.getId()).isEqualTo(7L);
        assertThat(member.getRole()).isEqualTo(Role.BUSINESS);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.NAVER);
        assertThat(member.getAuthVersion()).isEqualTo(1);
        assertThat(rows.get(issued.challengeId()).isConsumed()).isTrue();
        assertThat(rows.get(issued.challengeId()).getCodeHash()).isNull();
        assertThatThrownBy(() -> service.setPassword(member, NOW, issued.challengeId(), code, "OtherPassword123!", "OtherPassword123!"))
                .isInstanceOf(MemberException.class);
    }
    @Test void fiveWrongCodesExhaustTheChallengeEvenIfTheCorrectCodeIsLaterPresented() {
        socialOnly();
        var issued = service.sendPasswordCode(member, NOW, "owner@example.test");
        String correct = sentCode();
        String wrong = correct.equals("000000") ? "111111" : "000000";
        for (int attempt = 0; attempt < 5; attempt++) assertThatThrownBy(() ->
                service.setPassword(member, NOW, issued.challengeId(), wrong, "Password123!", "Password123!")).isInstanceOf(MemberException.class);
        assertThat(rows.get(issued.challengeId()).getAttemptCount()).isEqualTo(5);
        assertThatThrownBy(() -> service.setPassword(member, NOW, issued.challengeId(), correct, "Password123!", "Password123!"))
                .isInstanceOfSatisfying(MemberException.class, error ->
                        assertThat(error.getStatus()).isEqualTo(org.springframework.http.HttpStatus.BAD_REQUEST));
        assertThat(member.getPassword()).isNull();
    }
    @Test void staleSocialProofAndForeignEmailOwnershipAreRejected() {
        socialOnly();
        assertThatThrownBy(() -> service.sendPasswordCode(member, NOW.minusMinutes(6), "owner@example.test")).isInstanceOf(MemberException.class);
        when(members.findByEmail("taken@example.test")).thenReturn(Optional.of(Member.builder().id(9L).build()));
        assertThatThrownBy(() -> service.sendPasswordCode(member, NOW, "taken@example.test")).isInstanceOf(MemberException.class);
        verifyNoInteractions(emails);
    }
    @Test void theLastLoginMethodCannotBeRemoved() {
        assertThatThrownBy(() -> service.removePassword(member, NOW)).isInstanceOf(MemberException.class);
        socialOnly();
        assertThatThrownBy(() -> service.unlinkSocial(member, "Original123!")).isInstanceOf(MemberException.class);
        assertThat(member.getProvider()).isEqualTo(AuthProvider.NAVER);
        verifyNoInteractions(refresh);
    }
    @Test void unlinkingOnlyRemovesSocialAuthenticationAndRetainsTheOwnerAndPassword() {
        member.setProvider(AuthProvider.NAVER); member.setProviderId("naver-owner"); member.setOauthAuthenticatedAt(NOW.minusSeconds(10));
        String previous = member.getPassword();
        service.unlinkSocial(member, "Original123!");
        assertThat(member.getProvider()).isEqualTo(AuthProvider.LOCAL);
        assertThat(member.getProviderId()).isNull();
        assertThat(member.getPassword()).isEqualTo(previous);
        assertThat(member.getRole()).isEqualTo(Role.BUSINESS);
        assertThat(member.getId()).isEqualTo(7L);
        verify(subject).revoked(NOW, NOW);
        verify(refresh).deleteByMemberId(7L);
    }
}
