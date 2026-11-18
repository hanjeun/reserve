package kr.it.reserve.review.entity;

import jakarta.persistence.*;
import kr.it.reserve.member.entity.Member;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.LocalDateTime;

@Entity
@Table(name = "review_comment", uniqueConstraints =
        @UniqueConstraint(name = "uk_review_comment_request", columnNames = {"review_id", "member_id", "client_request_id"}),
        indexes = @Index(name = "idx_review_comment_order", columnList = "review_id,created_at,review_comment_id"))
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class ReviewComment {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "review_comment_id")
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "review_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Review review;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "member_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private Member member;

    @Column(name = "client_request_id", nullable = false, length = 36, updatable = false)
    private String clientRequestId;

    @Column(nullable = false, length = 500)
    private String content;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    public ReviewComment(Review review, Member member, String clientRequestId, String content, LocalDateTime createdAt) {
        this.review = review;
        this.member = member;
        this.clientRequestId = clientRequestId;
        this.content = content;
        this.createdAt = createdAt;
    }
}
