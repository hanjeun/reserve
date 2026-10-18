package kr.it.reserve.config.updates;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** A new persistence context prevents an after-commit listener from reading a stale managed member. */
@Service
@RequiredArgsConstructor
public class UpdateStreamAccess {
    private final MemberRepository members;
    private final TokenProvider tokens;

    public record Identity(Long memberId, int authVersion, Role role, LocalDateTime oauthAuthenticatedAt,
                           boolean termsRequired) { }

    public static Identity identity(Member member) {
        return identity(member, null);
    }

    public static Identity identity(Member member, LocalDateTime oauthAuthenticatedAt) {
        return identity(member, oauthAuthenticatedAt, true);
    }

    public static Identity waitingIdentity(Member member, LocalDateTime oauthAuthenticatedAt) {
        return identity(member, oauthAuthenticatedAt, false);
    }

    private static Identity identity(Member member, LocalDateTime oauthAuthenticatedAt, boolean termsRequired) {
        if (member == null || member.getId() == null || member.isDeleted() || member.isSuspended()
                || termsRequired && !member.isTermsAgreed()) return null;
        return new Identity(member.getId(), member.getAuthVersion(), member.getRole(), oauthAuthenticatedAt, termsRequired);
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public boolean current(Identity identity) {
        return identity != null && members.findByIdAndDeletedAtIsNull(identity.memberId())
                .filter(member -> !member.isDeleted() && !member.isSuspended()
                        && (!identity.termsRequired() || member.isTermsAgreed())
                        && member.getAuthVersion() == identity.authVersion() && member.getRole() == identity.role()
                        && tokens.isOAuthSessionCurrent(member, identity.oauthAuthenticatedAt()))
                .isPresent();
    }
}
