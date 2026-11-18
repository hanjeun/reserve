package kr.it.reserve.member.mfa;

import jakarta.persistence.EntityManager;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.persistence.CurrentLockedState;
import kr.it.reserve.global.security.ip.IpLoginProtection;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.LoginMethodChallengeRepository;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Clock;
import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor
public class AccountProtectionService {
    private static final long LINK_HOURS = 1;
    private final MemberRepository members;
    private final RefreshTokenRepository sessions;
    private final MfaChallengeRepository challenges;
    private final LoginMethodChallengeRepository loginMethods;
    private final PasswordResetTokenRepository passwordResets;
    private final MfaService mfa;
    private final MfaCrypto crypto;
    private final AccountProtectionAudit audit;
    private final IpLoginProtection ipProtection;
    private final EntityUpdates updates;
    private final EntityManager entityManager;

    public record Notice(String recipient, String linkKey) {
        @Override public String toString() { return "Notice[redacted]"; }
    }

    @Transactional
    public MfaService.Ticket begin(Member admin, String sid, boolean persistent, String previous, Long targetId, boolean resend) {
        Member target = members.findByIdAndDeletedAtIsNull(targetId).orElseThrow(MemberException::notFound);
        requireTarget(target, resend);
        return mfa.beginAdminProtection(admin, sid, persistent, previous, target, resend);
    }

    @Transactional
    public Notice protect(Member admin, String sid, String ticket, Long targetId, String reason, boolean resend) {
        int targetVersion = mfa.consumeAdminProtection(ticket, admin, sid, targetId, resend);
        Member target = members.findActiveByIdForUpdate(targetId).orElseThrow(MemberException::notFound);
        CurrentLockedState.refresh(entityManager, target);
        if (target.getAuthVersion() != targetVersion)
            throw new AuthException("회원의 로그인 상태가 바뀌었어요. 다시 확인해주세요.", HttpStatus.PRECONDITION_REQUIRED);
        requireTarget(target, resend);
        LocalDateTime now = LocalDateTime.now(Clock.systemUTC());
        String detail = reason == null ? "" : reason.strip();
        if (!resend && (detail.isBlank() || detail.length() > 200 || detail.codePoints().anyMatch(Character::isISOControl)))
            throw AuthException.badRequest("보호 사유를 200자 이내로 입력해주세요.");
        if (resend && target.getAccountRecoveryExpiresAt().minusHours(LINK_HOURS).plusMinutes(1).isAfter(now))
            throw new AuthException("복구 메일은 1분 뒤 다시 보낼 수 있어요.", HttpStatus.TOO_MANY_REQUESTS);

        Runnable retire = ipProtection.retireBrowserRegistrations(target);
        String key = crypto.randomToken();
        target.setAccountRecoveryLink(MfaCrypto.digest(key), now.plusHours(LINK_HOURS));
        target.recordOAuthSecurityRevocation(now);
        revoke(target);
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { retire.run(); }
        });
        audit.logAccountProtection(targetId, resend ? "RECOVERY_MAIL_RETRY" : "ACCOUNT_PROTECTED",
                admin.getId(), resend ? null : detail);
        return new Notice(target.getSecurityContactEmail(), key);
    }

    @Transactional(noRollbackFor = MfaService.RejectedProof.class)
    public Notice recover(String ticket, String kind, String proof) {
        Member target = mfa.verifyAccountRecovery(ticket, kind, proof);
        target.completeAccountRecovery();
        target.recordOAuthSecurityRevocation(LocalDateTime.now(Clock.systemUTC()));
        revoke(target);
        audit.logAccountProtection(target.getId(), "ACCOUNT_RECOVERED", null, null);
        return new Notice(target.getSecurityContactEmail(), null);
    }

    private void requireTarget(Member target, boolean resend) {
        if (target.isAdmin() || target.isDeleted()) throw AuthException.forbidden("이 회원에게는 계정 보호를 적용할 수 없어요.");
        if (target.isAccountProtected() != resend)
            throw new AuthException("계정 보호 상태가 바뀌었어요. 회원 목록을 다시 확인해주세요.", HttpStatus.CONFLICT);
        String email = target.getSecurityContactEmail();
        if (email == null || email.length() > 254 || !email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") || email.endsWith(".local")
                || !mfa.canRecoverAccount(target))
            throw AuthException.badRequest("확인한 보안 이메일과 등록된 인증 수단이 있어야 계정을 보호할 수 있어요.");
    }

    private void revoke(Member member) {
        member.rotateAuthVersion();
        sessions.deleteByMemberId(member.getId());
        updates.recheckSessions(member.getId());
        challenges.deleteByMemberId(member.getId());
        loginMethods.deleteByMemberId(member.getId());
        passwordResets.invalidateForEmail(member.getEmail());
    }
}
