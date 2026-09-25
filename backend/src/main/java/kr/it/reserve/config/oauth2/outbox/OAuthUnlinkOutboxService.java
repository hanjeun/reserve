package kr.it.reserve.config.oauth2.outbox;

import kr.it.reserve.member.entity.AuthProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
public class OAuthUnlinkOutboxService {

    private final OAuthUnlinkTaskRepository taskRepository;
    private final OAuthUnlinkTokenCipher tokenCipher;

    /** 회원 비식별화와 같은 트랜잭션에 외부 연동 해제 의도를 먼저 저장한다. */
    @Transactional
    public void enqueue(Long memberId, AuthProvider provider, String accessToken) {
        if (memberId == null || provider == null || provider == AuthProvider.LOCAL) return;
        String taskKey = sha256(memberId + ":" + provider.name());
        if (taskRepository.findByTaskKey(taskKey).isPresent()) return;
        taskRepository.save(OAuthUnlinkTask.pending(
                taskKey,
                memberId,
                provider,
                tokenCipher.encrypt(accessToken),
                LocalDateTime.now()));
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }
}
