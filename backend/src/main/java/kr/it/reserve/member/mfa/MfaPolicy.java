package kr.it.reserve.member.mfa;

import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class MfaPolicy {
    private final MfaProperties properties;
    private final MfaAccountRepository accounts;

    public boolean requires(Member member) {
        return mandatory(member);
    }
    public boolean mandatory(Member member) {
        // 등록을 중지해도 관리자가 설정한 추가 인증은 유지해요.
        return member.isAdmin() && (properties.isEnabled()
                || accounts.findById(member.getId()).map(MfaAccount::isEnabled).orElse(false));
    }
    /** 인증 조회에 포함된 등록 상태를 재사용해 관리자 요청마다 추가 SQL을 만들지 않아요. */
    public boolean mandatory(Member member, boolean enrolled) {
        return member.isAdmin() && (properties.isEnabled() || enrolled);
    }
    public boolean offersEnrollment(Member member) {
        return properties.isEnabled() && "BUSINESS".equals(member.getRole().name());
    }
    public static boolean strong(String method) {
        return "PASSWORD_MFA".equals(method) || "OAUTH_MFA".equals(method) || "PASSKEY".equals(method);
    }
}
