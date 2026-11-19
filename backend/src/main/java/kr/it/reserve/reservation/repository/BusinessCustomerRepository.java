package kr.it.reserve.reservation.repository;

import kr.it.reserve.reservation.entity.Reservation;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public interface BusinessCustomerRepository extends Repository<Reservation, Long> {
    // 레거시 예약은 ReservationPrivacyPolicy와 같은 종료 시각을 복원한다.
    String VISIBLE_RESERVATION = """
            r.deleted_at IS NULL AND m.deleted_at IS NULL AND s.deleted_at IS NULL
            AND s.owner_id = :ownerId
            AND COALESCE(r.usage_ends_at, CASE
                WHEN r.reservation_time IS NULL OR s.booking_type = 'DAY'
                    THEN TIMESTAMP(DATE_ADD(r.reservation_date, INTERVAL 1 DAY))
                ELSE TIMESTAMPADD(MINUTE, CASE WHEN r.service_duration_minutes > 0 THEN r.service_duration_minutes ELSE 60 END,
                    TIMESTAMP(r.reservation_date, r.reservation_time)) END) > :cutoff
            """;
    String CUSTOMER_RESERVATIONS = """
            FROM reservation r JOIN store s ON s.store_id = r.store_id
            JOIN member m ON m.member_id = r.member_id
            WHERE
            """ + VISIBLE_RESERVATION;
    String CUSTOMER_GROUPS = """
            WITH customer_counts AS (
                SELECT r.store_id, r.member_id, s.store_name, m.member_name, COUNT(*) AS reservations,
                    SUM(r.status = 'COMPLETED') AS completed,
                    SUM(r.status = 'CANCELLED' AND r.cancellation_actor = 'CUSTOMER') AS customer_canceled,
                    SUM(r.status = 'CANCELLED' AND r.cancellation_actor = 'STORE') AS store_canceled,
                    SUM(r.status = 'CANCELLED' AND r.cancellation_actor = 'SYSTEM') AS system_canceled,
                    SUM(r.status = 'CANCELLED' AND r.cancellation_actor IS NULL) AS unknown_canceled,
                    SUM(r.status = 'NO_SHOW') AS no_shows,
                    MAX(CASE WHEN r.status = 'COMPLETED' THEN r.reservation_date END) AS latest_visit,
                    MAX(r.created_at) AS latest_booking
            """ + CUSTOMER_RESERVATIONS + """
                AND (:storeId IS NULL OR r.store_id = :storeId)
                AND (:search = '' OR LOCATE(LOWER(:search), LOWER(m.member_name)) > 0 OR CAST(m.member_id AS CHAR) = :search)
                GROUP BY r.store_id, r.member_id, s.store_name, m.member_name
            )
            """;

    @Query(value = CUSTOMER_GROUPS + """
            SELECT c.store_id AS storeId, c.member_id AS memberId, c.store_name AS storeName, c.member_name AS name,
                c.reservations, c.completed, COALESCE(c.customer_canceled, 0) AS customerCanceled,
                COALESCE(c.store_canceled, 0) AS storeCanceled, COALESCE(c.system_canceled, 0) AS systemCanceled,
                c.unknown_canceled AS unknownCanceled, c.no_shows AS noShows, c.latest_visit AS latestVisit,
                COUNT(v.review_id) AS reviewCount, AVG(v.rating) AS averageRating,
                MAX(v.rating) AS highestRating, MIN(v.rating) AS lowestRating, restriction.ends_at AS restrictedUntil
            FROM customer_counts c
            LEFT JOIN review v ON v.store_id = c.store_id AND v.member_id = c.member_id
                AND v.deleted_at IS NULL AND v.moderation_hidden = FALSE
            LEFT JOIN store_booking_restriction restriction
                ON restriction.store_id = c.store_id AND restriction.member_id = c.member_id AND restriction.ends_at > :now
            GROUP BY c.store_id, c.member_id, c.store_name, c.member_name, c.reservations, c.completed,
                c.customer_canceled, c.store_canceled, c.system_canceled, c.unknown_canceled, c.no_shows,
                c.latest_visit, c.latest_booking, restriction.ends_at
            ORDER BY c.latest_booking DESC, c.store_id, c.member_id
            """, countQuery = CUSTOMER_GROUPS + "SELECT COUNT(*) FROM customer_counts", nativeQuery = true)
    Page<CustomerRow> customers(Long ownerId, Long storeId, String search, LocalDateTime cutoff, LocalDateTime now, Pageable page);

    String CUSTOMER_SCOPE = CUSTOMER_RESERVATIONS + " AND r.store_id = :storeId AND r.member_id = :memberId ";

    @Query(value = "SELECT EXISTS (SELECT 1 " + CUSTOMER_SCOPE + ")", nativeQuery = true)
    int hasVisibleCustomer(Long ownerId, Long storeId, Long memberId, LocalDateTime cutoff);

    @Query(value = """
            SELECT r.reservation_id AS id, r.reservation_code AS code, r.reservation_date AS visitDate,
                r.reservation_time AS visitTime, r.status, r.cancellation_actor AS cancellationActor
            """ + CUSTOMER_SCOPE + " ORDER BY r.reservation_date DESC, r.reservation_id DESC",
            countQuery = "SELECT COUNT(*) " + CUSTOMER_SCOPE, nativeQuery = true)
    Page<ReservationRow> reservations(Long ownerId, Long storeId, Long memberId, LocalDateTime cutoff, Pageable page);

    String CUSTOMER_REVIEWS = """
            FROM review v WHERE v.store_id = :storeId AND v.member_id = :memberId
                AND v.deleted_at IS NULL AND v.moderation_hidden = FALSE
            """;

    @Query(value = """
            SELECT v.review_id AS id, v.title, v.content, v.rating, v.created_at AS createdAt, v.owner_reply AS ownerReply
            """ + CUSTOMER_REVIEWS + " ORDER BY v.created_at DESC, v.review_id DESC",
            countQuery = "SELECT COUNT(*) " + CUSTOMER_REVIEWS, nativeQuery = true)
    Page<ReviewRow> reviews(Long storeId, Long memberId, Pageable page);

    @Query(value = """
            SELECT a.id, a.action, a.created_at AS createdAt,
                JSON_UNQUOTE(JSON_EXTRACT(a.snapshot, '$."제한 종료 (KST)"')) AS endsAt
            FROM audit_log a
            WHERE a.entity_type = 'MEMBER' AND a.entity_id = :memberId AND a.action IN ('BOOKING_RESTRICTED', 'BOOKING_RELEASED')
                AND JSON_UNQUOTE(JSON_EXTRACT(a.snapshot, '$."가게 번호"')) = CAST(:storeId AS CHAR)
            ORDER BY a.created_at DESC, a.id DESC
            """, countQuery = """
            SELECT COUNT(*) FROM audit_log a
            WHERE a.entity_type = 'MEMBER' AND a.entity_id = :memberId AND a.action IN ('BOOKING_RESTRICTED', 'BOOKING_RELEASED')
                AND JSON_UNQUOTE(JSON_EXTRACT(a.snapshot, '$."가게 번호"')) = CAST(:storeId AS CHAR)
            """, nativeQuery = true)
    Page<RestrictionRow> restrictionHistory(Long storeId, Long memberId, Pageable page);

    interface CustomerRow {
        Long getStoreId();
        Long getMemberId();
        String getStoreName();
        String getName();
        long getReservations();
        long getCompleted();
        long getCustomerCanceled();
        long getStoreCanceled();
        long getSystemCanceled();
        long getUnknownCanceled();
        long getNoShows();
        long getReviewCount();
        Double getAverageRating();
        Integer getHighestRating();
        Integer getLowestRating();
        LocalDate getLatestVisit();
        LocalDateTime getRestrictedUntil();
    }

    interface ReservationRow {
        Long getId();
        String getCode();
        LocalDate getVisitDate();
        LocalTime getVisitTime();
        String getStatus();
        String getCancellationActor();
    }

    interface ReviewRow {
        Long getId();
        String getTitle();
        String getContent();
        int getRating();
        LocalDateTime getCreatedAt();
        String getOwnerReply();
    }

    interface RestrictionRow {
        Long getId();
        String getAction();
        LocalDateTime getCreatedAt();
        String getEndsAt();
    }
}
