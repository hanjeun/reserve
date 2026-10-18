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

    public record SessionTokens(String accessToken, String refreshToken) { }

    @Transactional
    public SessionTokens issue(CustomOAuth2User principal) {
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
        SessionTokens pair = new SessionTokens(tokens.generateAccessToken(current, authentication.authenticatedAt()),
                tokens.generateRefreshToken(current, authentication.authenticatedAt()));
        members.flush();
        subjects.requireFreshAuthentication(authentication.authenticatedAt(), authentication.tokenExpiresAt());
        return pair;
    }

    private OAuth2AuthenticationException reauthenticate() {
        return new OAuth2AuthenticationException("oauth_reauthentication_required");
    }
}
