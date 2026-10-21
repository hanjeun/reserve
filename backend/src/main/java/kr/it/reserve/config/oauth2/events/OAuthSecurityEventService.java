package kr.it.reserve.config.oauth2.events;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
@Slf4j
public class OAuthSecurityEventService {
    private final OAuthSecurityEventTransaction transaction;
    private final OAuthSecurityEventRepository events;

    public void receive(VerifiedOAuthSecurityEvent event) {
        String hash = eventHash(event);
        try {
            transaction.process(event, hash);
        } catch (DataIntegrityViolationException exception) {
            // unique 경합의 패자 트랜잭션이 롤백된 뒤에만 이미 커밋된 사건인지 확인한다.
            if (!events.existsByEventHash(hash)) throw exception;
        }
        if (event.verificationStateHash() != null) {
            log.info("OAuth security stream verification received: provider={}, stateHash={}, eventHash={}",
                    event.provider(), event.verificationStateHash(), hash);
        }
    }

    static String eventHash(VerifiedOAuthSecurityEvent event) {
        try {
            byte[] value = (event.provider().name() + "\0" + event.eventId()).getBytes(StandardCharsets.UTF_8);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
