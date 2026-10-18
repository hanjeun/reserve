package kr.it.reserve.feed.repository;

import kr.it.reserve.feed.entity.FeedNotification;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.LocalDateTime;
import java.util.Optional;

public interface FeedNotificationRepository extends JpaRepository<FeedNotification, Long> {
    String SOURCE = " FROM FeedNotification n JOIN n.actor author JOIN author.member member JOIN n.comment c JOIN c.profile commenter JOIN commenter.member writer JOIN c.post p JOIN p.profile publisher JOIN publisher.member owner ";
    String AVAILABLE = "n.recipient.id = :memberId AND p.newsPromotion IS NULL AND p.state = kr.it.reserve.feed.entity.FeedPost.State.PUBLISHED "
        + "AND publisher.hidden = false AND publisher.nickname IS NOT NULL AND owner.deletedAt IS NULL AND owner.termsAgreed = true "
        + "AND (owner.status = kr.it.reserve.member.entity.MemberStatus.ACTIVE OR (owner.status = kr.it.reserve.member.entity.MemberStatus.SUSPENDED AND owner.suspendedUntil < :now)) "
        + "AND c.state = kr.it.reserve.feed.entity.FeedComment.State.PUBLISHED AND commenter.hidden = false AND writer.deletedAt IS NULL AND writer.termsAgreed = true "
        + "AND (writer.status = kr.it.reserve.member.entity.MemberStatus.ACTIVE OR (writer.status = kr.it.reserve.member.entity.MemberStatus.SUSPENDED AND writer.suspendedUntil < :now)) "
        + "AND NOT EXISTS (SELECT parent.id FROM FeedComment parent WHERE parent.id = c.parent.id AND parent.state = kr.it.reserve.feed.entity.FeedComment.State.HIDDEN) AND " + FeedCommentRepository.PUBLIC_AUTHOR;
    @Query(value = "SELECT n" + SOURCE + " WHERE " + AVAILABLE + " AND (:unread = false OR n.readAt IS NULL) ORDER BY n.createdAt DESC,n.id DESC",
           countQuery = "SELECT COUNT(n)" + SOURCE + " WHERE " + AVAILABLE + " AND (:unread = false OR n.readAt IS NULL)")
    Page<FeedNotification> list(@Param("memberId") Long member, @Param("unread") boolean unread, @Param("now") LocalDateTime now, Pageable page);
    @Query("SELECT COUNT(n)" + SOURCE + " WHERE " + AVAILABLE + " AND n.readAt IS NULL")
    long unread(@Param("memberId") Long member, @Param("now") LocalDateTime now);
    Optional<FeedNotification> findByIdAndRecipient_Id(Long id, Long member);
    boolean existsByRecipient_IdAndActor_IdAndComment_IdAndKind(Long member, Long actor, Long comment, String kind);
    @Modifying @Query("UPDATE FeedNotification n SET n.readAt = :now WHERE n.recipient.id = :member AND n.readAt IS NULL")
    int readAll(@Param("member") Long member, @Param("now") LocalDateTime now);
    @Modifying @Query("DELETE FROM FeedNotification n WHERE n.recipient.id = :member OR n.actor.id IN (SELECT p.id FROM FeedProfile p WHERE p.member.id = :member)")
    int withdraw(@Param("member") Long member);
    @Modifying @Query("DELETE FROM FeedNotification n WHERE n.createdAt < :cutoff")
    int purge(@Param("cutoff") LocalDateTime cutoff);
}
