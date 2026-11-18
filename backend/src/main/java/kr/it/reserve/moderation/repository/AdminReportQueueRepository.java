package kr.it.reserve.moderation.repository;

import kr.it.reserve.moderation.entity.ServiceReport;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDateTime;

public interface AdminReportQueueRepository extends Repository<ServiceReport, Long> {
    String QUEUE = """
            WITH queue AS (
                SELECT CAST(sr.target_type AS CHAR) AS reportType, sr.id, sr.target_id AS targetId,
                    s.store_name AS storeName, sr.reason, sr.status, sr.created_at AS createdAt, sr.reviewed_by AS reviewedBy
                FROM service_report sr LEFT JOIN store s ON sr.store_id = s.store_id
                UNION ALL
                SELECT 'CHAT', cr.id, cr.room_id, s.store_name, cr.reason, CAST(cr.status AS CHAR), cr.created_at, cr.reviewed_by_member_id
                FROM chat_report cr LEFT JOIN chat_room room ON room.id = cr.room_id LEFT JOIN store s ON room.store_id = s.store_id
                UNION ALL
                SELECT 'FEED', fr.report_id, COALESCE(fr.promotion_id, fr.post_id), NULL, fr.reason, CAST(fr.status AS CHAR), fr.created_at, NULL
                FROM feed_report fr
                UNION ALL
                SELECT 'FEED_COMMENT', fc.report_id, fc.comment_id, NULL, fc.reason, CAST(fc.status AS CHAR), fc.created_at, NULL
                FROM feed_comment_report fc
            )
            """;
    String FILTER = """
            FROM queue WHERE (:type IS NULL OR reportType = :type)
                AND (:status IS NULL OR status = :status)
            """;

    @Query(value = QUEUE + "SELECT * " + FILTER + " ORDER BY createdAt DESC, reportType, id DESC",
            countQuery = QUEUE + "SELECT COUNT(*) " + FILTER, nativeQuery = true)
    Page<QueueRow> list(String type, String status, Pageable page);

    interface QueueRow {
        String getReportType();
        Long getId();
        Long getTargetId();
        String getStoreName();
        String getReason();
        String getStatus();
        LocalDateTime getCreatedAt();
        Long getReviewedBy();
    }
}
