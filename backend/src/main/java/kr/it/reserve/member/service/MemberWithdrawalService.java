package kr.it.reserve.member.service;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/** API 탈퇴 진입의 공통 관문. 기존 거래/삭제/outbox 처리는 MemberService의 같은 TX에서 유지한다. */
@Service
@RequiredArgsConstructor
public class MemberWithdrawalService {
    private final MemberService memberService;
    private final MemberRepository members;
    private final OAuthSubjectSecurityService subjects;
    private final TokenProvider tokens;

    @Transactional
    public void withdraw(Member authenticated, LocalDateTime oauthAuthenticatedAt) {
        if (authenticated == null || authenticated.getId() == null) throw reauthenticate();
        // 잠금을 기다린 뒤 현재 Member 값으로 요청의 인증 문맥을 바꾸지 않는다.
        Long memberId = authenticated.getId();
        AuthProvider provider = authenticated.getProvider();
        String providerId = authenticated.getProviderId();
        int authVersion = authenticated.getAuthVersion();
        boolean oauth = provider != null && provider != AuthProvider.LOCAL;
        OAuthSubjectSecurity subject = null;
        if (oauth) {
            try { subject = subjects.lock(provider, providerId); }
            catch (IllegalArgumentException exception) { throw reauthenticate(); }
        }
        Member current = members.findActiveByIdForUpdate(memberId).orElseThrow(this::reauthenticate);
        if (current.getProvider() != provider || current.getAuthVersion() != authVersion || current.isSuspended()
                || oauth && !providerId.equals(current.getProviderId())) throw reauthenticate();
        if (subject != null) {
            subject.mergeMemberState(current.getOauthAuthenticatedAt(), current.getOauthSecurityRevokedAt());
            if (!tokens.isOAuthSessionCurrent(current, oauthAuthenticatedAt)
                    || subject.getRevokedAt() != null && (oauthAuthenticatedAt == null
                    || !oauthAuthenticatedAt.isAfter(subject.getRevokedAt()))) throw reauthenticate();
            LocalDateTime now = subjects.now();
            LocalDateTime cutoff = subject.getLastAuthenticatedAt() != null && subject.getLastAuthenticatedAt().isAfter(now)
                    ? subject.getLastAuthenticatedAt() : now;
            subject.revoked(cutoff, now);
            // 기존 정리 쿼리가 persistence context를 비워도 cutoff는 같은 TX에 남는다.
            members.flush();
        }
        memberService.deleteMember(memberId);
    }

    private AuthException reauthenticate() {
        return new AuthException("로그인 세션이 만료됐어요. 다시 로그인해주세요.");
    }
}
