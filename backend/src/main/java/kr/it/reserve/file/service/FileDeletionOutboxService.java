package kr.it.reserve.file.service;

import kr.it.reserve.file.entity.FileDeletionTask;
import kr.it.reserve.file.repository.FileDeletionTaskRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.HexFormat;

@Service
@RequiredArgsConstructor
public class FileDeletionOutboxService {

    private final FileDeletionTaskRepository taskRepository;

    /** 비즈니스 변경과 같은 트랜잭션에 삭제 의도를 넣는다. 실제 S3 호출은 스케줄러가 맡는다. */
    @Transactional
    public void enqueue(String target, String sourceType, Long sourceId) {
        if (target == null || target.isBlank()) return;

        String hash = sha256(target);
        if (taskRepository.findByTargetHash(hash).isPresent()) return;

        taskRepository.save(FileDeletionTask.pending(
                target,
                hash,
                sourceType,
                sourceId,
                LocalDateTime.now()));
    }

    private String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 is unavailable", e);
        }
    }
}
