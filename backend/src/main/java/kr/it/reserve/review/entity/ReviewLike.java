package kr.it.reserve.review.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import lombok.AccessLevel;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

@Entity
@Table(name = "review_like", uniqueConstraints =
        @UniqueConstraint(name = "uk_review_like_review_member", columnNames = {"review_id", "member_id"}))
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReviewLike {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "review_like_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "review_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Review review;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Member member;

    public ReviewLike(Review review, Member member) {
        this.review = review;
        this.member = member;
    }
}
