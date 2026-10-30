package kr.it.reserve.config.oauth2;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 공급자 인증 커밋과 성공 handler 사이에 사건이 처리되어도 옛 인증으로 세션을 다시 넣지 않는다. */
@Service
@RequiredArgsConstructor
public class OAuthSessionIssuer {
    private final TokenProvider tokens;
    private final MemberRepository members;
    private final OAuthSubjectSecurityService subjects;
    @org.springframework.beans.factory.annotation.Autowired private kr.it.reserve.member.mfa.MfaService mfa;

    public record SessionTokens(String accessToken, String refreshToken, java.time.Duration refreshMaxAge, String mfaTicket, boolean persistent) {
        public SessionTokens(String access, String refresh, java.time.Duration maxAge, String ticket) { this(access, refresh, maxAge, ticket, true); }
        public SessionTokens(String access, String refresh, java.time.Duration maxAge) { this(access, refresh, maxAge, null); }
        public SessionTokens(String accessToken, String refreshToken) { this(accessToken, refreshToken, null, null); }
        @Override public String toString() { return "SessionTokens[credentials=redacted]"; }
    }

    @Transactional
    public SessionTokens issue(CustomOAuth2User principal) { return issue(principal, true); }
    @Transactional
    public SessionTokens issue(CustomOAuth2User principal, boolean persistent) {
        CustomOAuth2User.OAuthAuthentication authentication = principal.getOauthAuthentication();
        if (authentication == null || authentication.memberId() == null) throw reauthenticate();
        OAuthSubjectSecurity subject = subjects.lock(authentication.provider(), authentication.providerId());
        Member current = members.findActiveByIdForUpdate(authentication.memberId()).orElseThrow(this::reauthenticate);
        if (current.getProvider() != authentication.provider()
                || !authentication.providerId().equals(current.getProviderId())
                || current.getAuthVersion() != authentication.authVersion() || current.isSuspended()) throw reauthenticate();
        subject.mergeMemberState(current.getOauthAuthenticatedAt(), current.getOauthSecurityRevokedAt());
        subjects.requireFreshAuthentication(authentication.authenticatedAt(), authentication.tokenExpiresAt());
        if (!subject.acceptsAuthentication(authentication.authenticatedAt())
                || !current.acceptsOAuthAuthentication(authentication.authenticatedAt())) throw reauthenticate();
        var ticket = mfa == null ? null : mfa.beginLogin(current, authentication.authenticatedAt(), authentication.tokenExpiresAt(), persistent);
        if (ticket != null) {
            members.flush();
            subjects.requireFreshAuthentication(authentication.authenticatedAt(), authentication.tokenExpiresAt());
            return new SessionTokens(null, null, null, ticket.value(), persistent);
        }
        TokenProvider.IssuedSession issued = tokens.issueSession(current, authentication.authenticatedAt(), persistent);
        SessionTokens pair = new SessionTokens(issued.accessToken(), issued.refreshToken(), issued.refreshMaxAge(), null, issued.persistent());
        members.flush();
        subjects.requireFreshAuthentication(authentication.authenticatedAt(), authentication.tokenExpiresAt());
        return pair;
    }

    private OAuth2AuthenticationException reauthenticate() {
        return new OAuth2AuthenticationException("oauth_reauthentication_required");
    }
}
