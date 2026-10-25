package kr.it.reserve.reservation.search;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import kr.it.reserve.member.policy.MemberSearchAccess;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

@Repository
@Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, timeout = 3)
class JpaReservationSearchReader implements ReservationSearchReader {
    @PersistenceContext private EntityManager entityManager;

    @Override public List<Hit> search(Long memberId, String pattern, LocalDate date, int limit) {
        MemberSearchAccess.requireWindow(limit);
        var query = entityManager.createQuery("""
                SELECT r.id, s.name, r.reservationCode, r.reservationDate, r.reservationTime
                  FROM Reservation r JOIN r.store s JOIN r.member viewer
                 WHERE viewer.id = :memberId AND r.deletedAt IS NULL
                   AND
                """ + MemberSearchAccess.VISIBLE + """
                   AND (:searchDate IS NULL OR r.reservationDate = :searchDate)
                   AND (LOWER(s.name) LIKE :keyword ESCAPE '!'
                        OR LOWER(r.reservationCode) LIKE :keyword ESCAPE '!'
                        OR LOWER(r.specialRequest) LIKE :keyword ESCAPE '!')
                 ORDER BY r.createdAt DESC, r.id DESC
                """, Object[].class).setParameter("keyword", pattern).setParameter("searchDate", date)
                .setMaxResults(limit);
        return MemberSearchAccess.bind(query, memberId).getResultList().stream()
                .map(row -> new Hit((Long) row[0], (String) row[1], (String) row[2], (LocalDate) row[3], (LocalTime) row[4])).toList();
    }
}
