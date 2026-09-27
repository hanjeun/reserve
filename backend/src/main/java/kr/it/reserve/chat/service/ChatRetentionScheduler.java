package kr.it.reserve.chat.service;

import kr.it.reserve.chat.repository.ChatMessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;

/** 검증/정책 고지 후 명시적으로 활성화. 기본값은 운영 원문을 파기하지 않는다. */
@Component
@RequiredArgsConstructor
@Slf4j
public class ChatRetentionScheduler {
    private final ChatMessageRepository messages;
    private final ChatRetentionService retention;
    @Value("${chat.retention.enabled:false}") private boolean enabled;

    @Scheduled(initialDelay = 600_000, fixedDelay = 600_000)
    @Transactional(readOnly = true)
    public void sweep() {
        if (!enabled) return;
        LocalDateTime now = LocalDateTime.now();
        for (var item : messages.findExpired(now.minusDays(ChatRetentionService.RETENTION_DAYS), PageRequest.of(0, 50))) {
            try { retention.purge(item.getRoom().getId(), item.getId(), now); }
            catch (RuntimeException failure) { log.warn("Chat retention failed: messageId={}, errorType={}", item.getId(), failure.getClass().getSimpleName()); }
        }
    }
}
