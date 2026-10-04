package kr.it.reserve.chat.repository;

import kr.it.reserve.chat.entity.ChatReportEvidence;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ChatReportEvidenceRepository extends JpaRepository<ChatReportEvidence, Long> {
    List<ChatReportEvidence> findByReportIdOrderByMessageIdAsc(Long reportId);
    Optional<ChatReportEvidence> findByReportIdAndMessageId(Long reportId, Long messageId);
    boolean existsByImageKey(String imageKey);
    boolean existsByImageKeyAndReportIdNot(String imageKey, Long reportId);

    @Modifying(flushAutomatically = true)
    @Query("DELETE FROM ChatReportEvidence e WHERE e.reportId = :reportId")
    void deleteByReportId(@Param("reportId") Long reportId);
}
