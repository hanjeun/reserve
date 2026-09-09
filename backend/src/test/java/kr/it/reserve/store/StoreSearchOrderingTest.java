package kr.it.reserve.store;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class StoreSearchOrderingTest {
    @Autowired EntityManager em;
    @Autowired StoreService service;

    @Test void rankingAndPublicFilterRunBeforePagingAndCountsMatch() {
        Member owner = Member.builder().name("검증").email("search-order@example.test").role(Role.BUSINESS).build();
        em.persist(owner);
        List<Long> ids = new ArrayList<>();
        for (int i = 0; i < 205; i++) {
            Store store = Store.builder().owner(owner).name("정렬검증가게")
                    .rating(i / 50.0).reviewCount(i).latitude(37.0 + (205 - i) * 0.001).longitude(127.0).build();
            em.persist(store); ids.add(store.getId());
        }
        Store hidden = Store.builder().owner(owner).name("정렬검증가게").rating(5.0).status(StoreStatus.BANNED).build();
        Store deleted = Store.builder().owner(owner).name("정렬검증가게").deletedAt(LocalDateTime.now()).build();
        em.persist(hidden); em.persist(deleted); em.flush();
        em.createQuery("UPDATE Store s SET s.createdAt = :at WHERE s.owner = :owner")
                .setParameter("at", LocalDateTime.of(2026, 1, 1, 0, 0)).setParameter("owner", owner).executeUpdate();
        em.clear();
        ids.sort(Comparator.reverseOrder());
        for (String sort : List.of("rating", "reviews", "recent", "distance")) {
            List<Long> actual = new ArrayList<>();
            for (int page = 0; page < 3; page++) {
                var result = service.searchStoresPaged("정렬검증", sort, page, 100, 37.0, 127.0);
                assertThat(result.getTotalElements()).isEqualTo(205);
                actual.addAll(result.getContent().stream().map(value -> value.getId()).toList());
            }
            assertThat(actual).containsExactlyElementsOf(ids);
        }
    }

    @Test void literalWildcardsAndInvalidCoordinatesDoNotExpandOrDestabilizeSearch() {
        Member owner = Member.builder().name("검증").email("search-literal@example.test").role(Role.BUSINESS).build();
        em.persist(owner);
        Store one = Store.builder().owner(owner).name("고유검색100%_정확").rating(3.0).build();
        Store two = Store.builder().owner(owner).name("고유검색100XX정확").rating(4.0).build();
        em.persist(one); em.persist(two); em.flush();
        assertThat(service.searchStoresPaged("고유검색100%_", "rating", 0, 15, null, null).getContent())
                .extracting(value -> value.getId()).containsExactly(one.getId());
        assertThat(service.searchStoresPaged("고유검색", "distance", 0, 15, Double.NaN, 127.0).getContent())
                .extracting(value -> value.getId()).containsExactly(two.getId(), one.getId());
    }
}
