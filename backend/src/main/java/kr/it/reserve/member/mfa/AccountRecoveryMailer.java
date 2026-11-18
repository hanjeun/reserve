package kr.it.reserve.member.mfa;

import kr.it.reserve.email.service.EmailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.Instant;

@Slf4j
@Service
@RequiredArgsConstructor
public class AccountRecoveryMailer {
    private final MfaService mfa;
    private final EmailService email;

    @Async("passwordResetExecutor")
    public void queueCode(String address, String reference, Instant expiresAt) {
        try {
            var delivery = mfa.issueAccountRecoveryEmail(address, reference, expiresAt);
            if (delivery != null) email.sendAccountRecoveryCodeEmail(delivery.recipient(), delivery.code());
        } catch (RuntimeException failure) {
            log.warn("Account recovery email request processing failed: errorType={}", failure.getClass().getSimpleName());
        }
    }
}
