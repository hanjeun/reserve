package kr.it.reserve.feed.repository;

import kr.it.reserve.feed.entity.ContentLike;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;
import java.util.Optional;

public interface ContentLikeRepository extends JpaRepository<ContentLike, Long> {
    Optional<ContentLike> findByMember_IdAndPost_Id(Long member, Long post);
    Optional<ContentLike> findByMember_IdAndNews_Id(Long member, Long news);
    Optional<ContentLike> findByMember_IdAndComment_Id(Long member, Long comment);
    long countByPost_Id(Long post);
    long countByNews_Id(Long news);
    long countByComment_Id(Long comment);
    interface NewsLikeSummary {
        Long getNewsId();
        long getLikeCount();
        long getViewerLikes();
    }

    @Query("""
            SELECT item.news.id AS newsId, COUNT(item) AS likeCount,
                   SUM(CASE WHEN item.member.id = :viewerId THEN 1 ELSE 0 END) AS viewerLikes
            FROM ContentLike item WHERE item.news.id IN :newsIds GROUP BY item.news.id
            """)
    List<NewsLikeSummary> summarizeNewsLikes(List<Long> newsIds, Long viewerId);

    Page<ContentLike> findByMember_IdOrderByCreatedAtDescIdDesc(Long member, Pageable page);
    Page<ContentLike> findByMember_IdAndPostIsNotNullOrderByCreatedAtDescIdDesc(Long member, Pageable page);
    Page<ContentLike> findByMember_IdAndNewsIsNotNullOrderByCreatedAtDescIdDesc(Long member, Pageable page);
    Page<ContentLike> findByMember_IdAndCommentIsNotNullOrderByCreatedAtDescIdDesc(Long member, Pageable page);
    @Modifying @Query("DELETE FROM ContentLike item WHERE item.member.id = :member")
    int withdraw(@Param("member") Long member);
}
