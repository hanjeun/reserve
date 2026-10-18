package kr.it.reserve.feed.repository;

import kr.it.reserve.feed.entity.FeedCommentReportImage;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface FeedCommentReportImageRepository extends JpaRepository<FeedCommentReportImage, Long> {
    List<FeedCommentReportImage> findByReport_IdOrderByPositionAscIdAsc(Long reportId);
    Optional<FeedCommentReportImage> findByIdAndReport_Id(Long imageId, Long reportId);
    boolean existsByImageKey(String imageKey);
}
