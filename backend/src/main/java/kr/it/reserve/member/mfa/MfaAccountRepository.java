package kr.it.reserve.member.mfa;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface MfaAccountRepository extends JpaRepository<MfaAccount, Long> {
    Optional<MfaAccount> findByUserHandle(String userHandle);
}
