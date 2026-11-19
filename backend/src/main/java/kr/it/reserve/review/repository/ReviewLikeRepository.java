package kr.it.reserve.review.repository;

import kr.it.reserve.review.entity.ReviewLike;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface ReviewLikeRepository extends JpaRepository<ReviewLike, Long> {
    Optional<ReviewLike> findByReview_IdAndMember_Id(Long reviewId, Long memberId);
    long countByReview_Id(Long reviewId);

    @Query("SELECT l.review.id AS reviewId, COUNT(l) AS total FROM ReviewLike l WHERE l.review.id IN :ids GROUP BY l.review.id")
    List<Count> countByReviewIds(Collection<Long> ids);

    @Query("SELECT l.review.id FROM ReviewLike l WHERE l.member.id = :memberId AND l.review.id IN :ids")
    List<Long> likedReviewIds(Long memberId, Collection<Long> ids);

    interface Count {
        Long getReviewId();
        long getTotal();
    }
}
