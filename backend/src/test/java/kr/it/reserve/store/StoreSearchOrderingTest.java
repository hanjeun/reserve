package kr.it.reserve.store;

import jakarta.persistence.EntityManager;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.entity.StoreStatus;
import kr.it.reserve.store.entity.ServiceDomain;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class StoreSearchOrderingTest {
    @Autowired EntityManager em;
    @Autowired StoreService service;
    @Autowired StoreRepository repository;

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
                actual.addAll(result.getContent().stream().map(StoreResponse::getId).toList());
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
        assertThat(service.searchStores("고유검색100%_", "rating"))
                .extracting(StoreResponse::getId).containsExactly(one.getId());
        assertThat(service.searchStores("고유검색100%_", "rating", null))
                .extracting(StoreResponse::getId).containsExactly(one.getId());
        assertThat(service.searchStoresPaged("고유검색100%_", "rating", 0, 15, null, null, null).getContent())
                .extracting(StoreResponse::getId).containsExactly(one.getId());
        assertThat(service.searchStoresPaged("고유검색100%_", "rating", 0, 15, null, null).getContent())
                .extracting(StoreResponse::getId).containsExactly(one.getId());
        assertThat(service.searchStoresPaged("고유검색", "distance", 0, 15, Double.NaN, 127.0).getContent())
                .extracting(StoreResponse::getId).containsExactly(two.getId(), one.getId());
    }

    @Test void distanceUsesBoundedCoordinateCandidatesAndStableDatabaseOrdering() {
        Member owner = Member.builder().name("거리 검증").email("distance-db@example.test").role(Role.BUSINESS).build();
        em.persist(owner);
        Store sameDistanceOlder = Store.builder().owner(owner).name("거리DB검증 동점1")
                .latitude(37.01).longitude(127.0).build();
        Store sameDistanceNewer = Store.builder().owner(owner).name("거리DB검증 동점2")
                .latitude(37.01).longitude(127.0).build();
        Store farther = Store.builder().owner(owner).name("거리DB검증 국내원거리")
                .latitude(38.0).longitude(127.0).build();
        Store outsideCandidateBox = Store.builder().owner(owner).name("거리DB검증 해외원거리")
                .latitude(55.0).longitude(127.0).build();
        Store missingCoordinates = Store.builder().owner(owner).name("거리DB검증 좌표없음").build();
        em.persist(sameDistanceOlder);
        em.persist(sameDistanceNewer);
        em.persist(farther);
        em.persist(outsideCandidateBox);
        em.persist(missingCoordinates);
        em.flush();

        var result = service.searchStoresPaged("거리DB검증", "distance", 0, 20, 37.0, 127.0);

        assertThat(result.getTotalElements()).isEqualTo(3);
        assertThat(result.getContent()).extracting(StoreResponse::getId)
                .containsExactly(sameDistanceNewer.getId(), sameDistanceOlder.getId(), farther.getId());
    }

    @Test void distanceBoundingBoxKeepsDatelineAndPoleCrossingCandidates() {
        Member owner = Member.builder().name("구면 경계 검증").email("distance-globe@example.test")
                .role(Role.BUSINESS).build();
        em.persist(owner);
        Store acrossDateline = Store.builder().owner(owner).name("날짜변경선검증")
                .latitude(0.0).longitude(-179.0).build();
        Store acrossPole = Store.builder().owner(owner).name("극점검증")
                .latitude(89.0).longitude(180.0).build();
        em.persist(acrossDateline);
        em.persist(acrossPole);
        em.flush();

        assertThat(service.searchStoresPaged(
                "날짜변경선검증", "distance", 0, 10, 0.0, 179.0).getContent())
                .extracting(StoreResponse::getId).containsExactly(acrossDateline.getId());
        assertThat(service.searchStoresPaged(
                "극점검증", "distance", 0, 10, 85.0, 0.0).getContent())
                .extracting(StoreResponse::getId).containsExactly(acrossPole.getId());
    }

    @Test void recommendationPlacesOnlyCurrentlyActiveBadgeStoresFirst() {
        Member owner = Member.builder().name("추천 검증").email("recommended-order@example.test").role(Role.BUSINESS).build();
        em.persist(owner);
        Store promoted = Store.builder().owner(owner).name("추천정렬검증 배지").rating(1.0).reviewCount(1).build();
        Store highestRated = Store.builder().owner(owner).name("추천정렬검증 일반").rating(5.0).reviewCount(100).build();
        Store expiredBadge = Store.builder().owner(owner).name("추천정렬검증 만료").rating(4.8).reviewCount(50).build();
        em.persist(promoted);
        em.persist(highestRated);
        em.persist(expiredBadge);
        em.persist(Advertisement.builder().store(promoted).adType(AdType.BADGE).status(AdStatus.ACTIVE)
                .startDate(ServiceTime.today()).endDate(ServiceTime.today().plusDays(1))
                .amount(1000).merchantUid("AD-" + UUID.randomUUID()).build());
        em.persist(Advertisement.builder().store(expiredBadge).adType(AdType.BADGE).status(AdStatus.ACTIVE)
                .startDate(ServiceTime.today().minusDays(2)).endDate(ServiceTime.today().minusDays(1))
                .amount(1000).merchantUid("AD-" + UUID.randomUUID()).build());
        em.flush();

        assertThat(service.searchStoresPaged("추천정렬검증", "recommended", 0, 12, null, null).getContent())
                .extracting(StoreResponse::getId)
                .containsExactly(promoted.getId(), highestRated.getId(), expiredBadge.getId());
    }

    @Test void activeExposureRunsBeforeEverySortAndDomainPaging() {
        Member owner = Member.builder().name("노출 검증").email("exposure-order@example.test")
                .role(Role.BUSINESS).build();
        em.persist(owner);
        Store promoted = Store.builder().owner(owner).name("노출형정렬 유료")
                .serviceDomain(ServiceDomain.FOOD).rating(1.0).reviewCount(1)
                .latitude(37.1).longitude(127.0).build();
        Store organic = Store.builder().owner(owner).name("노출형정렬 일반")
                .serviceDomain(ServiceDomain.FOOD).rating(5.0).reviewCount(100)
                .latitude(37.001).longitude(127.0).build();
        Store otherDomain = Store.builder().owner(owner).name("노출형정렬 다른분야")
                .serviceDomain(ServiceDomain.SPORTS).rating(4.9).reviewCount(90)
                .latitude(37.002).longitude(127.0).build();
        em.persist(promoted);
        em.persist(organic);
        em.persist(otherDomain);
        em.persist(Advertisement.builder().store(promoted).adType(AdType.BADGE).status(AdStatus.ACTIVE)
                .startDate(ServiceTime.today()).endDate(ServiceTime.today().plusDays(1))
                .amount(1000).merchantUid("AD-" + UUID.randomUUID()).build());
        em.flush();

        for (String sort : List.of("recommended", "rating", "reviews", "recent", "distance")) {
            var all = service.searchStoresPaged("노출형정렬", sort, 0, 1, 37.0, 127.0);
            assertThat(all.getTotalElements()).as(sort + " 전체").isEqualTo(3);
            assertThat(all.getContent()).as(sort + " 전체 첫 페이지")
                    .extracting(StoreResponse::getId).containsExactly(promoted.getId());

            var food = service.searchStoresPaged("노출형정렬", sort, 0, 1, 37.0, 127.0, "FOOD");
            assertThat(food.getTotalElements()).as(sort + " 분야").isEqualTo(2);
            assertThat(food.getContent()).as(sort + " 분야 첫 페이지")
                    .extracting(StoreResponse::getId).containsExactly(promoted.getId());
        }
    }

    @Test void regionProjectionAndFilterUseOnlyPublicActiveStores() {
        Member owner = Member.builder().name("검증").email("region-filter@example.test").role(Role.BUSINESS).build();
        em.persist(owner);
        Store seoul = Store.builder().owner(owner).name("서울 가게").address("서울특별시 종로구 청와대로").build();
        Store gyeonggi = Store.builder().owner(owner).name("경기 가게").address("경기 안산시 단원구 광덕로").build();
        Store banned = Store.builder().owner(owner).name("숨긴 가게").address("부산 해운대구").status(StoreStatus.BANNED).build();
        Store deleted = Store.builder().owner(owner).name("삭제한 가게").address("제주 제주시").deletedAt(LocalDateTime.now()).build();
        em.persist(seoul); em.persist(gyeonggi); em.persist(banned); em.persist(deleted); em.flush();

        assertThat(repository.findPublicAddresses())
                .contains("서울특별시 종로구 청와대로", "경기 안산시 단원구 광덕로")
                .doesNotContain("부산 해운대구", "제주 제주시");
        assertThat(service.getAvailableRegions()).extracting(group -> group.name())
                .contains("서울", "경기").doesNotContain("부산", "제주");
        assertThat(service.searchStoresPaged(
                new StoreService.SearchScope(null, "서울"),
                null, "rating", 0, 12, null, null)
                .getContent()).extracting(StoreResponse::getId).contains(seoul.getId()).doesNotContain(gyeonggi.getId());
    }
}
