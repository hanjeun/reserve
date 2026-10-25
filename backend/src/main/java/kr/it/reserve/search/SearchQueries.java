package kr.it.reserve.search;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Tuple;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.From;
import jakarta.persistence.criteria.Predicate;
import kr.it.reserve.chat.search.ChatSearchReader;
import kr.it.reserve.reservation.search.ReservationSearchReader;
import kr.it.reserve.waiting.search.WaitingSearchReader;
import kr.it.reserve.feed.entity.FeedPost;
import kr.it.reserve.feed.service.FeedService;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.MemberStatus;
import kr.it.reserve.promotion.StoreNewsPolicy;
import kr.it.reserve.promotion.entity.Promotion;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreSearchSpecification;
import kr.it.reserve.store.search.StoreFulltextSearch;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.List;

@Repository
@RequiredArgsConstructor
public class SearchQueries {
    private final FeedService feeds;
    private final ReservationSearchReader reservationSearch;
    private final WaitingSearchReader waitingSearch;
    private final ChatSearchReader chatSearch;
    private final StoreFulltextSearch storeFulltextSearch;
    @Value("${search.store.fulltext-enabled:true}") private boolean fulltextEnabled;
    @Value("${search.store.unified-fulltext-enabled:false}") private boolean unifiedFulltextEnabled;
    @PersistenceContext private EntityManager entityManager;

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, timeout = 3)
    public List<SearchResponse.Item> stores(SearchQuery input) {
        Specification<Store> visible = StoreSearchSpecification.publicSearch(input.term(), "recent", null, input.region(),
                new StoreSearchSpecification.DistanceCandidates(null, null, 0), ServiceTime.today());
        for (String related : input.related()) visible = visible.or(StoreSearchSpecification.publicSearch(related, "recent", null, input.region(),
                new StoreSearchSpecification.DistanceCandidates(null, null, 0), ServiceTime.today()));
        Specification<Store> matches = visible;
        Specification<Store> literal = (root, query, cb) -> {
            Predicate predicate = cb.and(matches.toPredicate(root, query, cb), activeMember(root.join("owner"), cb));
            if (query.getResultType() != Long.class && query.getResultType() != long.class) {
                var order = new java.util.ArrayList<>(query.getOrderList());
                Predicate original = cb.or(java.util.stream.Stream.of("name", "description", "address", "category", "keywords")
                        .map(field -> cb.like(cb.lower(root.get(field)), input.pattern(), '!')).toArray(Predicate[]::new));
                var rank = cb.<Integer>selectCase().when(cb.equal(cb.lower(root.get("name")), input.exact()), 0)
                        .when(cb.like(cb.lower(root.get("name")), input.prefix(), '!'), 1).when(original, 2).otherwise(3);
                order.addFirst(cb.asc(rank)); query.orderBy(order);
            }
            return predicate;
        };
        if (fulltextEnabled && unifiedFulltextEnabled) {
            String candidate = storeFulltextSearch.candidateQuery(input.term());
            if (!candidate.isEmpty()) {
                try {
                    return storeFulltextSearch.preview(literal, candidate, input.limit() + 1).stream()
                            .map(row -> item(row.id(), "STORE", row.name(),
                                    SearchQuery.text(row.category(), 50) + " · " + SearchQuery.text(row.address(), 100),
                                    "/store/" + row.id())).toList();
                } catch (DataAccessException failure) {
                    // 실패한 MATCH 트랜잭션이 끝난 뒤 원문 조회로 복귀한다.
                    storeFulltextSearch.disable();
                }
            }
        }
        CriteriaBuilder cb = entityManager.getCriteriaBuilder();
        CriteriaQuery<Tuple> query = cb.createTupleQuery();
        var root = query.from(Store.class);
        query.multiselect(root.get("id").alias("id"), root.get("name").alias("title"),
                root.get("category").alias("category"), root.get("address").alias("address"));
        query.where(literal.toPredicate(root, query, cb));
        return entityManager.createQuery(query).setMaxResults(input.limit() + 1).getResultList().stream()
                .map(row -> item(row.get("id", Long.class), "STORE", row.get("title", String.class),
                        SearchQuery.text(row.get("category", String.class), 50) + " · " + SearchQuery.text(row.get("address", String.class), 100),
                        "/store/" + row.get("id", Long.class))).toList();
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, timeout = 3)
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
        query.orderBy(cb.asc(cb.<Integer>selectCase().when(cb.equal(cb.lower(root.get("title")), input.exact()), 0)
                .when(cb.like(cb.lower(root.get("title")), input.prefix(), '!'), 1).otherwise(2)),
                cb.desc(root.get("createdAt")), cb.desc(root.get("id")));
        return entityManager.createQuery(query).setParameter("keyword", input.pattern()).setMaxResults(input.limit() + 1)
                .getResultList().stream().map(row -> item(row.get("id", Long.class), "BENEFIT", row.get("title", String.class),
                        row.get("description", String.class), "/benefits/" + row.get("id", Long.class))).toList();
    }

    @Transactional(readOnly = true, propagation = Propagation.REQUIRES_NEW, timeout = 3)
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
        return reservationSearch.search(memberId, input.pattern(), input.date(), input.limit() + 1).stream()
                .map(row -> item(row.id(), "RESERVATION", row.storeName(),
                        (row.code() == null ? "예약" : row.code()) + " · " + row.date() + " " + row.time(),
                        "/my-reservations?reservationId=" + row.id())).toList();
    }

    public List<SearchResponse.Item> waiting(SearchQuery input, Long memberId) {
        return waitingSearch.search(memberId, input.pattern(), input.date(), input.limit() + 1).stream()
                .map(row -> item(row.id(), "WAITING", row.storeName(),
                        "접수 " + row.entryNumber() + "번 · " + row.date(),
                        "/my-reservations?tab=waiting&entryId=" + row.id())).toList();
    }

    public List<SearchResponse.Item> messages(SearchQuery input, Long memberId, boolean business) {
        return chatSearch.search(memberId, business, input.pattern(), input.date(), input.limit() + 1).stream().map(row -> {
            String path = !row.customer() ? "/messages?ownerRoomId=" + row.roomId()
                    : row.support() ? "/messages?kind=support" : "/messages?storeId=" + row.storeId();
            String title = row.support() ? "RESERVE 고객지원" : SearchQuery.text(row.storeName(), 80);
            return item(row.id(), "MESSAGE", title.isBlank() ? "가게 문의" : title, row.excerpt(), path);
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
