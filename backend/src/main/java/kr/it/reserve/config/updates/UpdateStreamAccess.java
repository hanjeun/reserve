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

/** 커밋 후 리스너가 이전 회원 객체를 읽지 않도록 새 영속성 문맥을 사용한다. */
@Service
@RequiredArgsConstructor
public class UpdateStreamAccess {
    private final MemberRepository members;
    private final TokenProvider tokens;

    public record Identity(Long memberId, int authVersion, Role role, LocalDateTime oauthAuthenticatedAt,
                           String loginMethod, String sessionId, boolean termsRequired) { }

    public static Identity identity(Member member) {
        return identity(member, null);
    }

    public static Identity identity(Member member, LocalDateTime oauthAuthenticatedAt) {
        return identity(member, oauthAuthenticatedAt, null);
    }

    public static Identity identity(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod) {
        return identity(member, oauthAuthenticatedAt, loginMethod, null);
    }

    public static Identity identity(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod, String sessionId) {
        return identity(member, oauthAuthenticatedAt, loginMethod, sessionId, true);
    }

    public static Identity waitingIdentity(Member member, LocalDateTime oauthAuthenticatedAt) {
        return waitingIdentity(member, oauthAuthenticatedAt, null);
    }

    public static Identity waitingIdentity(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod) {
        return waitingIdentity(member, oauthAuthenticatedAt, loginMethod, null);
    }

    public static Identity waitingIdentity(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod, String sessionId) {
        return identity(member, oauthAuthenticatedAt, loginMethod, sessionId, false);
    }

    private static Identity identity(Member member, LocalDateTime oauthAuthenticatedAt, String loginMethod, String sessionId, boolean termsRequired) {
        if (member == null || member.getId() == null || member.isDeleted() || member.isSuspended()
                || termsRequired && !member.isTermsAgreed()) return null;
        return new Identity(member.getId(), member.getAuthVersion(), member.getRole(), oauthAuthenticatedAt, loginMethod, sessionId, termsRequired);
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
    public boolean current(Identity identity) {
        return identity != null && identity.sessionId() != null && members.findByIdAndDeletedAtIsNull(identity.memberId())
                .filter(member -> !member.isDeleted() && !member.isSuspended()
                        && (!identity.termsRequired() || member.isTermsAgreed())
                        && member.getAuthVersion() == identity.authVersion() && member.getRole() == identity.role()
                        && tokens.isDeviceSessionCurrent(identity.sessionId(), identity.memberId())
                        && tokens.isLoginSessionCurrent(member, identity.oauthAuthenticatedAt(), identity.loginMethod()))
                .isPresent();
    }
}
