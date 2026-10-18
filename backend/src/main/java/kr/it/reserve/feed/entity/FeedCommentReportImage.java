package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity @Getter @NoArgsConstructor
@Table(name = "feed_comment_report_image", indexes = {
    @Index(name = "ix_comment_evidence_report", columnList = "report_id,position,evidence_id"),
    @Index(name = "ix_comment_evidence_key", columnList = "image_key")
})
public class FeedCommentReportImage {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "evidence_id") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "report_id", nullable = false, updatable = false) private FeedCommentReport report;
    @Column(name = "owner_id", nullable = false, updatable = false) private Long ownerId;
    @Column(name = "original_media_id", nullable = false, updatable = false) private Long originalMediaId;
    @Column(name = "image_key", nullable = false, length = 700, updatable = false) private String imageKey;
    @Column(name = "content_type", nullable = false, length = 40, updatable = false) private String contentType;
    @Column(nullable = false, updatable = false) private int width;
    @Column(nullable = false, updatable = false) private int height;
    @Column(nullable = false, updatable = false) private int position;
    public static FeedCommentReportImage capture(FeedCommentReport report, FeedMedia media) {
        FeedCommentReportImage image = new FeedCommentReportImage(); image.report = report; image.ownerId = media.getMember().getId();
        image.originalMediaId = media.getId(); image.imageKey = media.getImageKey(); image.contentType = media.getContentType();
        image.width = media.getWidth(); image.height = media.getHeight(); image.position = media.getPosition(); return image;
    }
}
