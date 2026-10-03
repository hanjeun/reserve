package kr.it.reserve.store;

import jakarta.persistence.EntityManager;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class StoreRegionFilteringTest {

    @Autowired EntityManager entityManager;
    @Autowired StoreService service;

    @Test
    void databaseFiltersOfficialAndShortPrefixesBeforePagination() {
        Member owner = owner("region-filter@example.test");
        Store gyeonggi = store(owner, "지역필터검증 경기", "경기도 안산시 단원구");
        Store seoulJongno = store(owner, "지역필터검증 서울종로", "서울특별시 종로구 청와대로");
        Store seoulJung = store(owner, "지역필터검증 서울중구", "서울 중구 세종대로");
        Store busan = store(owner, "지역필터검증 부산", "부산광역시 해운대구 바닷길");
        entityManager.persist(gyeonggi);
        entityManager.persist(seoulJongno);
        entityManager.persist(seoulJung);
        entityManager.persist(busan);
        entityManager.flush();

        var seoul = service.searchStoresPaged(
                new StoreService.SearchScope(null, "서울"),
                "지역필터검증", "rating", 0, 1, null, null);
        assertThat(seoul.getTotalElements()).isEqualTo(2);
        assertThat(seoul.getContent()).extracting(StoreResponse::getId)
                .containsExactly(seoulJung.getId());

        var district = service.searchStoresPaged(
                new StoreService.SearchScope(null, "서울 종로구"),
                "지역필터검증", "rating", 0, 10, null, null);
        assertThat(district.getTotalElements()).isEqualTo(1);
        assertThat(district.getContent()).extracting(StoreResponse::getId)
                .containsExactly(seoulJongno.getId());

        var shortProvince = service.searchStoresPaged(
                new StoreService.SearchScope(null, "경기"),
                "지역필터검증", "rating", 0, 10, null, null);
        assertThat(shortProvince.getContent()).extracting(StoreResponse::getId)
                .containsExactly(gyeonggi.getId());
        assertThat(service.searchStoresPaged(
                new StoreService.SearchScope(null, "제주"),
                "지역필터검증", "rating", 0, 10, null, null).getTotalElements())
                .isZero();
    }

    @Test
    void groupsOnlyProjectedPublicAddressesAndKeepsRealDistrictCounts() {
        Member owner = owner("region-group@example.test");
        entityManager.persist(store(owner, "지역그룹검증1", "서울특별시 종로구 청와대로"));
        entityManager.persist(store(owner, "지역그룹검증2", "서울 종로구 가로수길"));
        entityManager.persist(store(owner, "지역그룹검증3", "서울 중구 세종대로"));
        entityManager.persist(store(owner, "지역그룹검증4", "경기 안산시 단원구"));
        entityManager.persist(store(owner, "지역그룹검증5", "경기도 안산시 상록구"));
        entityManager.flush();

        var groups = service.getAvailableRegions();
        assertThat(groups).hasSize(2);
        assertThat(groups.getFirst().name()).isEqualTo("서울");
        assertThat(groups.getFirst().count()).isEqualTo(3);
        assertThat(groups.getFirst().areas())
                .extracting(area -> area.name() + ":" + area.count())
                .containsExactly("종로구:2", "중구:1");
        assertThat(groups.get(1).name()).isEqualTo("경기");
        assertThat(groups.get(1).areas()).extracting(area -> area.name() + ":" + area.count())
                .containsExactly("안산시:2");
    }

    private Member owner(String email) {
        Member owner = Member.builder().name("지역 검증").email(email).role(Role.BUSINESS).build();
        entityManager.persist(owner);
        return owner;
    }

    private static Store store(Member owner, String name, String address) {
        return Store.builder()
                .owner(owner)
                .name(name)
                .address(address)
                .rating(4.0)
                .reviewCount(0)
                .build();
    }
}
