package kr.it.reserve.waiting.search;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import kr.it.reserve.member.policy.MemberSearchAccess;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import kr.it.reserve.global.common.ServiceTime;
import java.time.ZoneOffset;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.List;

@Repository
@Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, timeout = 3)
class JpaWaitingSearchReader implements WaitingSearchReader {
    @PersistenceContext private EntityManager entityManager;

    @Override public List<Hit> search(Long memberId, String pattern, LocalDate date, int limit) {
        MemberSearchAccess.requireWindow(limit);
        var today = ServiceTime.today().atStartOfDay(ServiceTime.ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        var query = entityManager.createQuery("""
                SELECT w.id, COALESCE(s.name, '가게'), w.entryNumber, w.businessDate
                  FROM WaitingEntry w LEFT JOIN Store s ON s.id = w.storeId
                 WHERE w.memberId = :memberId AND
                """ + WaitingEntryRepository.PERSONAL_VISIBLE_WINDOW + """
                   AND
                """ + MemberSearchAccess.EXISTS + """

                   AND (:searchDate IS NULL OR w.businessDate = :searchDate)
                   AND (LOWER(COALESCE(s.name, '가게')) LIKE :keyword ESCAPE '!'
                        OR CAST(w.entryNumber AS string) LIKE :keyword ESCAPE '!')
                 ORDER BY w.createdAt DESC, w.id DESC
                """, Object[].class).setParameter("keyword", pattern).setParameter("searchDate", date)
                .setParameter("active", WaitingStatus.ACTIVE).setParameter("dayStart", today)
                .setMaxResults(limit);
        return MemberSearchAccess.bind(query, memberId).getResultList().stream()
                .map(row -> new Hit((Long) row[0], (String) row[1], ((Number) row[2]).intValue(), (LocalDate) row[3])).toList();
    }
}
