package kr.it.reserve.search;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.Predicate;
import kr.it.reserve.chat.service.ChatRetentionPolicy;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreSearchSpecification;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;

@Repository
@RequiredArgsConstructor
@Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW)
public class SearchQueries {
    private final FeedService feeds;
    @PersistenceContext private EntityManager entityManager;

    public List<SearchResponse.Item> stores(SearchQuery input) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        var root = query.from(Store.class);
        var visible = StoreSearchSpecification.publicSearch(input.keyword(), "recent", null, null,
                new StoreSearchSpecification.DistanceCandidates(null, null, 0), ServiceTime.today());
        query.multiselect(root.get("id").alias("id"), root.get("name").alias("title"),
                root.get("category").alias("category"), root.get("address").alias("address"));
        query.where(cb.and(visible.toPredicate(root, query, cb), activeMember(root.join("owner"), cb)));
        return entityManager.createQuery(query).setMaxResults(input.limit() + 1).getResultList().stream()
                .map(row -> item(row.get("id", Long.class), "STORE", row.get("title", String.class),
                        SearchQuery.text(row.get("category", String.class), 50) + " · " + SearchQuery.text(row.get("address", String.class), 100),
                        "/store/" + row.get("id", Long.class))).toList();
    }

    public List<SearchResponse.Item> benefits(SearchQuery input) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        var root = query.from(Promotion.class);
        var keyword = cb.parameter(String.class, "keyword");
        query.multiselect(root.get("id").alias("id"), root.get("title").alias("title"),
                cb.substring(root.get("content"), 1, 160).alias("description"));
        query.where(cb.and(StoreNewsPolicy.publicSpecification(null, null, true).toPredicate(root, query, cb),
                cb.or(cb.like(cb.lower(root.get("title")), keyword, '!'),
                        cb.like(cb.lower(root.get("content")), keyword, '!'), cb.like(cb.lower(root.get("tags")), keyword, '!'))));
        query.orderBy(cb.desc(root.get("createdAt")), cb.desc(root.get("id")));
        return entityManager.createQuery(query).setParameter("keyword", input.pattern()).setMaxResults(input.limit() + 1)
                .getResultList().stream().map(row -> item(row.get("id", Long.class), "BENEFIT", row.get("title", String.class),
                        row.get("description", String.class), "/benefits/" + row.get("id", Long.class))).toList();
    }

    public List<SearchResponse.Item> feed(SearchQuery input) {
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        var root = query.from(FeedPost.class);
        var keyword = cb.parameter(String.class, "keyword");
        query.multiselect(root.get("id").alias("id"), root.get("profile").get("nickname").alias("title"),
                cb.substring(root.get("content"), 1, 160).alias("description"));
        query.where(cb.and(feeds.publicSearchSpecification().toPredicate(root, query, cb), cb.isNull(root.get("deletedAt")),
                cb.or(cb.like(cb.lower(root.get("content")), keyword, '!'),
                        cb.like(cb.lower(root.get("profile").get("nickname")), keyword, '!'),
                        cb.like(cb.lower(root.get("region")), keyword, '!'))));
        query.orderBy(cb.desc(root.get("createdAt")), cb.desc(root.get("id")));
        return entityManager.createQuery(query).setParameter("keyword", input.pattern()).setMaxResults(input.limit() + 1)
                .getResultList().stream().map(row -> item(row.get("id", Long.class), "FEED",
                        row.get("title", String.class) + "의 게시글", row.get("description", String.class),
                        "/feed/posts/" + row.get("id", Long.class))).toList();
    }

    public List<SearchResponse.Item> reservations(SearchQuery input, Long memberId) {
        return entityManager.createQuery("""
                SELECT r.id, s.name, r.reservationCode, r.reservationDate, r.reservationTime
                  FROM Reservation r JOIN r.store s JOIN r.member viewer
                 WHERE viewer.id = :memberId AND viewer.deletedAt IS NULL AND r.deletedAt IS NULL
                   AND (viewer.status = :active OR (viewer.status = :suspended AND viewer.suspendedUntil < :sanctions))
                   AND (LOWER(s.name) LIKE :keyword ESCAPE '!'
                        OR LOWER(r.reservationCode) LIKE :keyword ESCAPE '!'
                        OR LOWER(r.specialRequest) LIKE :keyword ESCAPE '!')
                 ORDER BY r.createdAt DESC, r.id DESC
                """, Object[].class).setParameter("memberId", memberId).setParameter("keyword", input.pattern())
                .setParameter("active", MemberStatus.ACTIVE).setParameter("suspended", MemberStatus.SUSPENDED)
                .setParameter("sanctions", LocalDateTime.now(Clock.systemDefaultZone())).setMaxResults(input.limit() + 1)
                .getResultList().stream().map(row -> item((Long) row[0], "RESERVATION", (String) row[1],
                        (row[2] == null ? "예약" : row[2]) + " · " + row[3] + " " + row[4],
                        "/my-reservations?reservationId=" + row[0])).toList();
    }

    public List<SearchResponse.Item> waiting(SearchQuery input, Long memberId) {
        var today = ServiceTime.today().atStartOfDay(ServiceTime.ZONE).withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        return entityManager.createQuery("""
                SELECT w.id, COALESCE(s.name, '가게'), w.entryNumber, w.businessDate
                  FROM WaitingEntry w LEFT JOIN Store s ON s.id = w.storeId
                 WHERE w.memberId = :memberId AND
                """ + WaitingEntryRepository.PERSONAL_VISIBLE_WINDOW + """
                   AND EXISTS (SELECT viewer.id FROM Member viewer WHERE viewer.id = :memberId AND viewer.deletedAt IS NULL
                     AND (viewer.status = :memberActive OR (viewer.status = :memberSuspended AND viewer.suspendedUntil < :sanctions)))
                   AND (LOWER(COALESCE(s.name, '가게')) LIKE :keyword ESCAPE '!'
                        OR CAST(w.entryNumber AS string) LIKE :keyword ESCAPE '!')
                 ORDER BY w.createdAt DESC, w.id DESC
                """, Object[].class).setParameter("memberId", memberId).setParameter("keyword", input.pattern())
                .setParameter("active", WaitingStatus.ACTIVE).setParameter("dayStart", today)
                .setParameter("memberActive", MemberStatus.ACTIVE).setParameter("memberSuspended", MemberStatus.SUSPENDED)
                .setParameter("sanctions", LocalDateTime.now(Clock.systemDefaultZone())).setMaxResults(input.limit() + 1)
                .getResultList().stream().map(row -> item((Long) row[0], "WAITING", (String) row[1],
                        "접수 " + row[2] + "번 · " + row[3], "/my-reservations?tab=waiting&entryId=" + row[0])).toList();
    }

    public List<SearchResponse.Item> messages(SearchQuery input, Long memberId, boolean business) {
        // Search is narrower than archived conversation reads: blocked rooms and messages older than 90 days are omitted.
        // Sender IDs, images, storage keys, encrypted payloads and signed URLs never enter this projection.
        return entityManager.createQuery("""
                SELECT message.id, room.id, room.type, room.storeId, room.storeNameSnapshot,
                       SUBSTRING(message.content, 1, 160), room.member.id
                  FROM ChatMessage message JOIN message.room room
                 WHERE message.purgedAt IS NULL AND message.retractedAt IS NULL AND message.createdAt >= :cutoff
                   AND (room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.SUPPORT
                        OR (room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.STORE AND room.storeId > 0))
                   AND room.memberBlockedAt IS NULL AND room.ownerBlockedAt IS NULL
                   AND NOT EXISTS (SELECT hidden.id FROM ChatMessageHidden hidden
                                    WHERE hidden.message.id = message.id AND hidden.member.id = :memberId)
                   AND EXISTS (SELECT viewer.id FROM Member viewer WHERE viewer.id = :memberId AND viewer.deletedAt IS NULL
                     AND (viewer.status = :active OR (viewer.status = :suspended AND viewer.suspendedUntil < :sanctions)))
                   AND ((room.member.id = :memberId AND room.memberHiddenAt IS NULL)
                     OR (:business = true AND room.type = kr.it.reserve.chat.entity.ChatRoom.RoomType.STORE
                       AND (room.ownerHiddenAt IS NULL OR room.ownerHiddenByMemberId <> :memberId)
                       AND EXISTS (SELECT store.id FROM Store store WHERE store.id = room.storeId
                            AND store.owner.id = :memberId AND store.owner.role = kr.it.reserve.member.entity.Role.BUSINESS)))
                   AND LOWER(message.content) LIKE :keyword ESCAPE '!'
                 ORDER BY message.createdAt DESC, message.id DESC
                """, Object[].class).setParameter("memberId", memberId).setParameter("business", business)
                .setParameter("keyword", input.pattern()).setParameter("cutoff", LocalDateTime.now(Clock.systemDefaultZone())
                        .minusDays(ChatRetentionPolicy.MESSAGE_RETENTION_DAYS))
                .setParameter("active", MemberStatus.ACTIVE).setParameter("suspended", MemberStatus.SUSPENDED)
                .setParameter("sanctions", LocalDateTime.now(Clock.systemDefaultZone())).setMaxResults(input.limit() + 1)
                .getResultList().stream().map(row -> {
                    boolean customer = memberId.equals(row[6]);
                    boolean support = row[2] == kr.it.reserve.chat.entity.ChatRoom.RoomType.SUPPORT;
                    String path = !customer ? "/messages?ownerRoomId=" + row[1]
                            : support ? "/messages?kind=support" : "/messages?storeId=" + row[3];
                    String title = support ? "RESERVE 고객지원" : SearchQuery.text((String) row[4], 80);
                    return item((Long) row[0], "MESSAGE", title.isBlank() ? "가게 문의" : title, (String) row[5], path);
                }).toList();
    }

    private Predicate activeMember(From<?, ?> member, CriteriaBuilder cb) {
        return cb.and(cb.isNull(member.get("deletedAt")), cb.isTrue(member.get("termsAgreed")),
                cb.or(cb.equal(member.get("status"), MemberStatus.ACTIVE), cb.and(cb.equal(member.get("status"), MemberStatus.SUSPENDED),
                        cb.lessThan(member.get("suspendedUntil"), LocalDateTime.now(Clock.systemDefaultZone())))));
    }
    private SearchResponse.Item item(Long id, String type, String title, String description, String path) {
        return new SearchResponse.Item(id, type, SearchQuery.text(title, 100), SearchQuery.text(description, 160), path);
    }
}
