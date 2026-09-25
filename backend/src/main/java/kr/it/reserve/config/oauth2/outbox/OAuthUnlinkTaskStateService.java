package kr.it.reserve.config.oauth2.outbox;

import kr.it.reserve.member.entity.AuthProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * OAuth 외부 호출 전후의 짧은 DB 상태 전환만 담당한다.
 * 네트워크 호출은 이 빈 바깥에서 실행해 행 잠금과 DB 연결을 붙들지 않는다.
 */
@Service
@RequiredArgsConstructor
public class OAuthUnlinkTaskStateService {

    private static final long LEASE_MINUTES = 1;
    private final OAuthUnlinkTaskRepository taskRepository;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Claim claim(Long taskId, LocalDateTime now) {
        OAuthUnlinkTask task = taskRepository.findByIdForUpdate(taskId).orElse(null);
        if (task == null || !task.canClaim(now)) return null;

        String leaseId = UUID.randomUUID().toString();
        task.markProcessing(now.plusMinutes(LEASE_MINUTES), leaseId);
        return new Claim(
                task.getId() == null ? taskId : task.getId(),
                task.getMemberId(),
                task.getProvider(),
                task.getEncryptedAccessToken(),
                leaseId);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markCompleted(Long taskId, String leaseId, LocalDateTime now) {
        taskRepository.findByIdForUpdate(taskId)
                .filter(task -> task.ownsLease(leaseId))
                .ifPresent(task -> task.markCompleted(now));
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void markFailed(Long taskId, String leaseId, LocalDateTime now, String errorType) {
        taskRepository.findByIdForUpdate(taskId)
                .filter(task -> task.ownsLease(leaseId))
                .ifPresent(task -> task.markFailed(now, errorType));
    }

    public record Claim(
            Long taskId,
            Long memberId,
            AuthProvider provider,
            String encryptedAccessToken,
            String leaseId) {
    }
}
