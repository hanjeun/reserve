package kr.it.reserve.chat.repository;

import kr.it.reserve.chat.entity.ChatReportEvidence;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ChatReportEvidenceRepository extends JpaRepository<ChatReportEvidence, Long> {
    List<ChatReportEvidence> findByReportIdOrderByMessageIdAsc(Long reportId);
    Optional<ChatReportEvidence> findByReportIdAndMessageId(Long reportId, Long messageId);
    boolean existsByImageKey(String imageKey);
}
