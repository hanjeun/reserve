package kr.it.reserve.member.mfa;

public interface AccountProtectionAudit {
    void logAccountProtection(Long memberId, String action, Long adminId, String reason);
}
