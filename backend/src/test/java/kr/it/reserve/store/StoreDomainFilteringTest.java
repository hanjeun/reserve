package kr.it.reserve.store;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.ServiceDomain;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class StoreDomainFilteringTest {

    @Autowired EntityManager entityManager;
    @Autowired StoreService service;

    @Test
    void databaseFiltersBeforePaginationAndIncludesLegacyNullRows() {
        Member owner = Member.builder()
                .name("분야 검증")
                .email("domain-filter@example.test")
                .role(Role.BUSINESS)
                .build();
        entityManager.persist(owner);

        Store explicitFood = store(owner, "분야필터검증 명시", "필라테스", ServiceDomain.FOOD);
        Store legacySports = store(owner, "분야필터검증 레거시운동", "필라테스", null);
        Store legacyFood = store(owner, "분야필터검증 레거시음식", "카페", null);
        entityManager.persist(explicitFood);
        entityManager.persist(legacySports);
        entityManager.persist(legacyFood);
        entityManager.flush();

        var result = service.searchStoresPaged(
                "분야필터검증", "rating", 0, 1, null, null, "SPORTS");

        assertThat(result.getTotalElements()).isEqualTo(1);
        assertThat(result.getContent())
                .extracting(response -> response.getId())
                .containsExactly(legacySports.getId());
        assertThat(result.getContent().getFirst().getServiceDomain()).isEqualTo("SPORTS");
    }

    @Test
    void legacyUnclassifiedCategoryMapsToOtherInsideDatabasePredicate() {
        Member owner = Member.builder()
                .name("기타 분야 검증")
                .email("domain-other@example.test")
                .role(Role.BUSINESS)
                .build();
        entityManager.persist(owner);
        Store legacyOther = store(owner, "기타분야필터검증", null, null);
        entityManager.persist(legacyOther);
        entityManager.flush();

        assertThat(service.searchStoresPaged(
                "기타분야필터검증", "rating", 0, 10, null, null, "OTHER").getContent())
                .extracting(response -> response.getId())
                .containsExactly(legacyOther.getId());
    }

    @Test
    void overlappingLegacyWordsUseTheSameFirstMatchPrecedenceInJavaAndDatabase() {
        Member owner = Member.builder()
                .name("분야 우선순위 검증")
                .email("domain-precedence@example.test")
                .role(Role.BUSINESS)
                .build();
        entityManager.persist(owner);
        Store overlapping = store(owner, "중첩분야필터검증", "카페 클래스", null);
        entityManager.persist(overlapping);
        entityManager.flush();

        assertThat(ServiceDomain.inferFromCategory("카페 클래스")).isEqualTo(ServiceDomain.FOOD);
        assertThat(service.searchStoresPaged(
                "중첩분야필터검증", "rating", 0, 10, null, null, "FOOD").getContent())
                .extracting(response -> response.getId())
                .containsExactly(overlapping.getId());
        assertThat(service.searchStoresPaged(
                "중첩분야필터검증", "rating", 0, 10, null, null, "PERFORMANCE").getContent())
                .isEmpty();
    }

    private static Store store(Member owner, String name, String category, ServiceDomain domain) {
        return Store.builder()
                .owner(owner)
                .name(name)
                .category(category)
                .serviceDomain(domain)
                .rating(4.0)
                .reviewCount(0)
                .build();
    }
}
