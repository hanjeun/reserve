package kr.it.reserve.chat.search;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import kr.it.reserve.member.policy.MemberSearchAccess;
import kr.it.reserve.chat.service.ChatRetentionPolicy;
import kr.it.reserve.global.common.ServiceTime;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.List;

@Repository
@Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, timeout = 3)
class JpaChatSearchReader implements ChatSearchReader {
    @PersistenceContext private EntityManager entityManager;

    @Override public List<Hit> search(Long memberId, boolean business, String pattern, LocalDate date, int limit) {
        MemberSearchAccess.requireWindow(limit);
        var start = date == null ? null : date.atStartOfDay(ServiceTime.ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        var end = date == null ? null : date.plusDays(1).atStartOfDay(ServiceTime.ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        var query = entityManager.createQuery("""
                SELECT message.id, room.id, room.type, room.storeId, room.storeNameSnapshot,
                       SUBSTRING(message.content, 1, 160), room.member.id
                  FROM ChatMessage message JOIN message.room room
                 WHERE message.purgedAt IS NULL AND message.retractedAt IS NULL AND message.createdAt >= :cutoff
                   AND (:searchStart IS NULL OR message.createdAt >= :searchStart AND message.createdAt < :searchEnd)
                   AND (room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.SUPPORT
                        OR (room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.STORE AND room.storeId > 0))
                   AND room.memberBlockedAt IS NULL AND room.ownerBlockedAt IS NULL
                   AND NOT EXISTS (SELECT hidden.id FROM ChatMessageHidden hidden
                                    WHERE hidden.message.id = message.id AND hidden.member.id = :memberId)
                   AND
                """ + MemberSearchAccess.EXISTS + """

                   AND ((room.member.id = :memberId AND room.memberHiddenAt IS NULL)
                     OR (:business = true AND room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.STORE
                       AND (room.ownerHiddenAt IS NULL OR room.ownerHiddenByMemberId <> :memberId)
                       AND EXISTS (SELECT store.id FROM Store store WHERE store.id = room.storeId
                            AND store.owner.id = :memberId AND store.owner.role = kr.it.reserve.member.entity.Role.BUSINESS)))
                   AND LOWER(message.content) LIKE :keyword ESCAPE '!'
                 ORDER BY message.createdAt DESC, message.id DESC
                """, Object[].class).setParameter("business", business)
                .setParameter("keyword", pattern).setParameter("searchStart", start).setParameter("searchEnd", end)
                .setParameter("cutoff", LocalDateTime.now(Clock.systemDefaultZone())
                        .minusDays(ChatRetentionPolicy.MESSAGE_RETENTION_DAYS))
                .setMaxResults(limit);
        return MemberSearchAccess.bind(query, memberId).getResultList().stream()
                .map(row -> new Hit((Long) row[0], (Long) row[1], (Long) row[3], (String) row[4], (String) row[5], memberId.equals(row[6]), row[2] == kr.it.reserve.chat.entity.ChatRoom.RoomType.SUPPORT)).toList();
    }
}
