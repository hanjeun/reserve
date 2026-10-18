package kr.it.reserve.feed.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "feed_report_image", indexes = {
    @Index(name = "ix_feed_evidence_report", columnList = "report_id,position,evidence_id"),
    @Index(name = "ix_feed_evidence_key", columnList = "image_key")
})
@Getter @NoArgsConstructor
public class FeedReportImage {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) @Column(name = "evidence_id") private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "report_id", nullable = false, updatable = false) private FeedReport report;
    @Column(name = "original_media_id", nullable = false, updatable = false) private Long originalMediaId;
    @Column(name = "owner_id", nullable = false, updatable = false) private Long ownerId;
    @Column(name = "image_key", nullable = false, length = 700, updatable = false) private String imageKey;
    @Column(name = "content_type", nullable = false, length = 40, updatable = false) private String contentType;
    @Column(nullable = false, updatable = false) private int width;
    @Column(nullable = false, updatable = false) private int height;
    @Column(nullable = false, updatable = false) private int position;
    public static FeedReportImage capture(FeedReport report, FeedMedia media) {
        FeedReportImage image = new FeedReportImage(); image.report = report; image.originalMediaId = media.getId();
        image.ownerId = media.getMember().getId(); image.imageKey = media.getImageKey(); image.contentType = media.getContentType();
        image.width = media.getWidth(); image.height = media.getHeight(); image.position = media.getPosition(); return image;
    }
}
