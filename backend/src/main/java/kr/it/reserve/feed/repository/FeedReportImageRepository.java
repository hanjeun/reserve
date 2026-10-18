package kr.it.reserve.feed.repository;

import kr.it.reserve.feed.entity.FeedReportImage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface FeedReportImageRepository extends JpaRepository<FeedReportImage, Long> {
    List<FeedReportImage> findByReport_IdOrderByPositionAscIdAsc(Long reportId);
    Optional<FeedReportImage> findByIdAndReport_Id(Long id, Long reportId);
    boolean existsByImageKey(String imageKey);
}
