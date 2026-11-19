package kr.it.reserve.review.repository;

import kr.it.reserve.review.entity.ReviewComment;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ReviewCommentRepository extends JpaRepository<ReviewComment, Long> {
    String VISIBLE_AUTHOR = """
            m.deletedAt IS NULL AND m.termsAgreed = true AND
            (m.status = kr.it.reserve.member.entity.MemberStatus.ACTIVE OR
            (m.status = kr.it.reserve.member.entity.MemberStatus.SUSPENDED AND m.suspendedUntil < :now))
            """;

    @EntityGraph(attributePaths = "member")
    @Query("SELECT c FROM ReviewComment c JOIN c.member m WHERE c.review.id = :id AND " + VISIBLE_AUTHOR
            + " ORDER BY c.createdAt DESC, c.id DESC")
    Page<ReviewComment> findVisible(Long id, LocalDateTime now, Pageable page);

    @Query("SELECT COUNT(c) FROM ReviewComment c JOIN c.member m WHERE c.review.id = :id AND " + VISIBLE_AUTHOR)
    long countVisible(Long id, LocalDateTime now);

    @Query("SELECT c.review.id AS reviewId, COUNT(c) AS total FROM ReviewComment c JOIN c.member m WHERE c.review.id IN :ids AND "
            + VISIBLE_AUTHOR + " GROUP BY c.review.id")
    List<ReviewLikeRepository.Count> countVisibleByReviewIds(Collection<Long> ids, LocalDateTime now);

    Optional<ReviewComment> findByIdAndReview_Id(Long id, Long reviewId);
    Optional<ReviewComment> findByReview_IdAndMember_IdAndClientRequestId(Long reviewId, Long memberId, String clientRequestId);
}
