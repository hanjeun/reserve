package kr.it.reserve.moderation.repository;

import kr.it.reserve.moderation.entity.ServiceReportEntry;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ServiceReportEntryRepository extends JpaRepository<ServiceReportEntry, Long> {
    boolean existsByReportIdAndActorIdAndKind(Long reportId, Long actorId, ServiceReportEntry.Kind kind);

    Page<ServiceReportEntry> findByReportIdOrderByIdDesc(Long reportId, Pageable page);
}
