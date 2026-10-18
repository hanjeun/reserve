package kr.it.reserve.feed.repository;

import jakarta.persistence.LockModeType;
import kr.it.reserve.feed.entity.FeedPost;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FeedPostRepository extends JpaRepository<FeedPost, Long>, JpaSpecificationExecutor<FeedPost> {
    Optional<FeedPost> findByProfile_Member_IdAndClientRequestId(Long memberId, String clientRequestId);
    Optional<FeedPost> findByNewsPromotion_Id(Long promotionId);
    @Query("SELECT p.newsPromotion.id FROM FeedPost p WHERE p.id = :id")
    Optional<Long> newsSourceId(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM FeedPost p WHERE p.id = :id")
    Optional<FeedPost> findForUpdate(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("SELECT p FROM FeedPost p WHERE p.id = :id")
    Optional<FeedPost> findForRead(@Param("id") Long id);
    Page<FeedPost> findByProfile_Member_IdAndStateOrderByCreatedAtDescIdDesc(Long memberId, FeedPost.State state, Pageable pageable);
    Page<FeedPost> findByProfile_Member_IdAndStateNotOrderByCreatedAtDescIdDesc(Long memberId, FeedPost.State state, Pageable pageable);
    Page<FeedPost> findByProfile_Member_IdAndNewsPromotionIsNullAndStateOrderByCreatedAtDescIdDesc(Long memberId, FeedPost.State state, Pageable pageable);
    @Query("SELECT p FROM FeedPost p WHERE p.profile.member.id = :memberId AND p.newsPromotion IS NULL AND p.state <> :state AND p.state <> kr.it.reserve.feed.entity.FeedPost.State.DELETED ORDER BY p.createdAt DESC, p.id DESC")
    Page<FeedPost> findByProfile_Member_IdAndNewsPromotionIsNullAndStateNotOrderByCreatedAtDescIdDesc(@Param("memberId") Long memberId, @Param("state") FeedPost.State state, Pageable pageable);
    @Query("SELECT p.id FROM FeedPost p WHERE p.state = :state AND p.deletedAt < :cutoff ORDER BY p.id")
    List<Long> purgeCandidates(@Param("state") FeedPost.State state, @Param("cutoff") LocalDateTime cutoff, Pageable pageable);
    @Modifying
    @Query("UPDATE FeedPost p SET p.state = :state, p.deletedAt = :now, p.updatedAt = :now, p.revision = p.revision + 1 WHERE p.profile.id IN (SELECT profile.id FROM FeedProfile profile WHERE profile.member.id = :memberId) AND p.deletedAt IS NULL")
    int withdraw(@Param("memberId") Long memberId, @Param("state") FeedPost.State state, @Param("now") LocalDateTime now);

    @Modifying(flushAutomatically = true)
    @Query("UPDATE FeedPost p SET p.state = kr.it.reserve.feed.entity.FeedPost.State.DELETED, p.deletedAt = :now, p.updatedAt = :now, p.revision = p.revision + 1 WHERE p.newsPromotion.id IN (SELECT news.id FROM Promotion news WHERE news.store.id = :storeId) AND p.deletedAt IS NULL")
    int closeStoreNews(@Param("storeId") Long storeId, @Param("now") LocalDateTime now);
}
