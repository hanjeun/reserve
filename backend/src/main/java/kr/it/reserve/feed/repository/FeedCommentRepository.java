package kr.it.reserve.feed.repository;

import kr.it.reserve.feed.entity.FeedComment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface FeedCommentRepository extends JpaRepository<FeedComment, Long> {
    String PUBLIC_AUTHOR = "author.hidden = false AND member.deletedAt IS NULL AND member.termsAgreed = true "
        + "AND (member.status = kr.it.reserve.member.entity.MemberStatus.ACTIVE OR "
        + "(member.status = kr.it.reserve.member.entity.MemberStatus.SUSPENDED AND member.suspendedUntil < :now))";
    String PUBLIC_COMMENT = "c.state = kr.it.reserve.feed.entity.FeedComment.State.PUBLISHED AND " + PUBLIC_AUTHOR;
    @Query("SELECT c FROM FeedComment c LEFT JOIN c.profile author LEFT JOIN author.member member WHERE c.post.id = :post AND c.parent IS NULL AND c.state <> kr.it.reserve.feed.entity.FeedComment.State.HIDDEN "
        + "AND ((" + PUBLIC_COMMENT + ") OR EXISTS (SELECT r.id FROM FeedComment r WHERE r.parent = c AND r.state = kr.it.reserve.feed.entity.FeedComment.State.PUBLISHED "
        + "AND r.profile.hidden = false AND r.profile.member.deletedAt IS NULL AND r.profile.member.termsAgreed = true AND "
        + "(r.profile.member.status = kr.it.reserve.member.entity.MemberStatus.ACTIVE OR (r.profile.member.status = kr.it.reserve.member.entity.MemberStatus.SUSPENDED AND r.profile.member.suspendedUntil < :now)))) ORDER BY c.createdAt, c.id")
    Page<FeedComment> roots(@Param("post") Long post, @Param("now") LocalDateTime now, Pageable page);
    @Query("SELECT c FROM FeedComment c LEFT JOIN c.profile author LEFT JOIN author.member member WHERE c.parent.id = :parent AND c.parent.state <> kr.it.reserve.feed.entity.FeedComment.State.HIDDEN AND " + PUBLIC_COMMENT + " ORDER BY c.createdAt, c.id")
    Page<FeedComment> replies(@Param("parent") Long parent, @Param("now") LocalDateTime now, Pageable page);
    @Query("SELECT COUNT(c) FROM FeedComment c LEFT JOIN c.profile author LEFT JOIN author.member member WHERE c.post.id = :post AND NOT EXISTS "
        + "(SELECT parent.id FROM FeedComment parent WHERE parent.id = c.parent.id AND parent.state = kr.it.reserve.feed.entity.FeedComment.State.HIDDEN) AND " + PUBLIC_COMMENT)
    long countVisible(@Param("post") Long post, @Param("now") LocalDateTime now);
    @Query("SELECT COUNT(c) FROM FeedComment c LEFT JOIN c.profile author LEFT JOIN author.member member WHERE c.parent.id = :parent AND " + PUBLIC_COMMENT)
    long countReplies(@Param("parent") Long parent, @Param("now") LocalDateTime now);
    Optional<FeedComment> findByProfile_Member_IdAndClientRequestId(Long member, String requestId);
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("SELECT c FROM FeedComment c WHERE c.id = :id")
    Optional<FeedComment> findForUpdate(@Param("id") Long id);
    @Lock(LockModeType.PESSIMISTIC_READ) @Query("SELECT c FROM FeedComment c WHERE c.id = :id")
    Optional<FeedComment> findForRead(@Param("id") Long id);
    boolean existsByParent_Id(Long parent);
    @Query("SELECT c.id FROM FeedComment c WHERE c.state = kr.it.reserve.feed.entity.FeedComment.State.DELETED AND c.deletedAt < :cutoff ORDER BY c.id")
    List<Long> purgeCandidates(@Param("cutoff") LocalDateTime cutoff, Pageable page);
    @Modifying @Query("UPDATE FeedComment c SET c.state = kr.it.reserve.feed.entity.FeedComment.State.DELETED, c.deletedAt = :now, c.updatedAt = :now, c.revision = c.revision + 1 "
        + "WHERE c.profile.id IN (SELECT profile.id FROM FeedProfile profile WHERE profile.member.id = :member) AND c.state <> kr.it.reserve.feed.entity.FeedComment.State.DELETED")
    int withdraw(@Param("member") Long member, @Param("now") LocalDateTime now);
}
