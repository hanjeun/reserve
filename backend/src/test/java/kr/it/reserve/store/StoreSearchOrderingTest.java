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
import kr.it.reserve.store.entity.WaitingIntakeMode;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import kr.it.reserve.waiting.error.WaitingException;
import kr.it.reserve.waiting.service.CustomerWaitingService;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
@Transactional
class StoreSearchOrderingTest {
    @Autowired EntityManager em;
    @Autowired StoreService service;
    @Autowired StoreRepository repository;
    @Autowired CustomerWaitingService waiting;

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

    @Test void waitingDirectoryFiltersRegionAndIntakeBeforePagingAndCountsMatch() {
        String keyword = "웨이팅지역검증-" + UUID.randomUUID();
        Member owner = waitingDirectoryOwner("region");
        Store onsite = waitingDirectoryStore(owner, keyword + " 현장", "경기 안산시 단원구",
                WaitingIntakeMode.ONSITE, false, 4.0, 12);
        Store remotePaused = waitingDirectoryStore(owner, keyword + " 원격 중지", "경기도 안산시 상록구",
                WaitingIntakeMode.REMOTE, true, 4.9, 3);
        Store both = waitingDirectoryStore(owner, keyword + " 모두", "경기 안산시 단원구",
                WaitingIntakeMode.BOTH, false, 4.7, 9);
        Store seoul = waitingDirectoryStore(owner, keyword + " 서울", "서울특별시 종로구",
                WaitingIntakeMode.BOTH, false, 5.0, 100);
        waitingDirectoryStore(owner, keyword + " 접수 꺼짐", "경기 안산시 단원구",
                WaitingIntakeMode.OFF, false, 5.0, 1000);
        Store banned = waitingDirectoryStore(owner, keyword + " 제재", "경기 안산시 단원구",
                WaitingIntakeMode.BOTH, false, 5.0, 1000);
        banned.setStatus(StoreStatus.BANNED);
        Store deleted = waitingDirectoryStore(owner, keyword + " 삭제", "경기 안산시 단원구",
                WaitingIntakeMode.REMOTE, false, 5.0, 1000);
        deleted.setDeletedAt(LocalDateTime.now());
        em.flush();
        em.clear();

        assertWaitingDirectoryPages(keyword, new CustomerWaitingService.DirectoryFilters("경기 안산시", "ALL", "rating"),
                List.of(remotePaused.getId(), both.getId(), onsite.getId()));
        assertWaitingDirectoryPages(keyword, new CustomerWaitingService.DirectoryFilters("경기 안산시", "OPEN", "rating"),
                List.of(both.getId(), onsite.getId()));
        assertWaitingDirectoryPages(keyword, new CustomerWaitingService.DirectoryFilters("경기 안산시", "PAUSED", "rating"),
                List.of(remotePaused.getId()));
        assertWaitingDirectoryPages(keyword, new CustomerWaitingService.DirectoryFilters("", "ALL", "rating"),
                List.of(seoul.getId(), remotePaused.getId(), both.getId(), onsite.getId()));
        assertWaitingDirectoryPages(keyword, new CustomerWaitingService.DirectoryFilters("서울", "OPEN", "rating"),
                List.of(seoul.getId()));
        assertWaitingDirectoryPages(keyword, new CustomerWaitingService.DirectoryFilters("서울", "PAUSED", "rating"), List.of());
    }

    @Test void waitingDirectoryRankingAndLiteralSearchRunBeforePaging() {
        String keyword = "웨이팅정렬검증-" + UUID.randomUUID();
        String literal = keyword + "100%_";
        Member owner = waitingDirectoryOwner("ranking");
        Store promoted = waitingDirectoryStore(owner, literal + " 배지", "경기 안산시 단원구",
                WaitingIntakeMode.BOTH, false, 1.0, 1);
        Store highestRated = waitingDirectoryStore(owner, literal + " 별점", "경기 안산시 단원구",
                WaitingIntakeMode.ONSITE, false, 5.0, 10);
        Store mostReviewed = waitingDirectoryStore(owner, literal + " 리뷰", "경기 안산시 단원구",
                WaitingIntakeMode.REMOTE, false, 4.0, 100);
        Store ratingTie = waitingDirectoryStore(owner, literal + " 동점", "서울특별시 종로구",
                WaitingIntakeMode.REMOTE, false, 5.0, 2);
        Store categoryMatch = waitingDirectoryStore(owner, keyword + " 카테고리", "경기 안산시 단원구",
                WaitingIntakeMode.BOTH, false, 3.0, 5);
        categoryMatch.setCategory(literal);
        waitingDirectoryStore(owner, keyword + "100X_ 밑줄만", "경기 안산시 단원구",
                WaitingIntakeMode.BOTH, false, 5.0, 1000);
        waitingDirectoryStore(owner, keyword + "100%X 퍼센트만", "경기 안산시 단원구",
                WaitingIntakeMode.BOTH, false, 5.0, 1000);
        Store descriptionOnly = waitingDirectoryStore(owner, keyword + " 설명만", "경기 안산시 단원구",
                WaitingIntakeMode.BOTH, false, 5.0, 1000);
        descriptionOnly.setDescription(literal);
        em.persist(Advertisement.builder().store(promoted).adType(AdType.BADGE).status(AdStatus.ACTIVE)
                .startDate(ServiceTime.today()).endDate(ServiceTime.today().plusDays(1))
                .amount(1000).merchantUid("AD-" + UUID.randomUUID()).build());
        em.flush();
        em.createQuery("UPDATE Store s SET s.createdAt = :at WHERE s.owner = :owner")
                .setParameter("at", LocalDateTime.of(2026, 1, 1, 0, 0)).setParameter("owner", owner).executeUpdate();
        em.clear();

        assertWaitingDirectoryPages(literal, new CustomerWaitingService.DirectoryFilters("", "ALL", "recommended"),
                List.of(promoted.getId(), highestRated.getId(), ratingTie.getId(), mostReviewed.getId(), categoryMatch.getId()));
        assertWaitingDirectoryPages(literal, new CustomerWaitingService.DirectoryFilters("", "ALL", "rating"),
                List.of(promoted.getId(), ratingTie.getId(), highestRated.getId(), mostReviewed.getId(), categoryMatch.getId()));
        assertWaitingDirectoryPages(literal, new CustomerWaitingService.DirectoryFilters("", "ALL", "reviewCount"),
                List.of(promoted.getId(), mostReviewed.getId(), highestRated.getId(), categoryMatch.getId(), ratingTie.getId()));
        assertThat(waiting.directory(literal, 1, 1).getContent()).extracting(StoreResponse::getId)
                .containsExactly(categoryMatch.getId());
        assertThat(waiting.directory(literal, 1, 1, new CustomerWaitingService.DirectoryFilters(null, null, null)).getContent())
                .extracting(StoreResponse::getId).containsExactly(highestRated.getId());
    }

    @Test void waitingDirectoryRejectsInvalidFiltersBeforeDatabaseAccess() {
        var statistics = em.getEntityManagerFactory().unwrap(SessionFactory.class).getStatistics();
        boolean wasEnabled = statistics.isStatisticsEnabled();
        statistics.setStatisticsEnabled(true);
        try {
            long statementsBefore = statistics.getPrepareStatementCount();
            for (var filters : List.of(
                    new CustomerWaitingService.DirectoryFilters("가".repeat(101), "ALL", "recommended"),
                    new CustomerWaitingService.DirectoryFilters("", "WAITING", "recommended"),
                    new CustomerWaitingService.DirectoryFilters("", "ALL", "rating desc; drop table store"))) {
                assertThatThrownBy(() -> waiting.directory("", 0, 1, filters))
                        .isInstanceOfSatisfying(WaitingException.class,
                                error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
            }
            assertThatThrownBy(() -> waiting.directory("가".repeat(101), 0, 1,
                    new CustomerWaitingService.DirectoryFilters("", "ALL", "recommended")))
                    .isInstanceOfSatisfying(WaitingException.class,
                            error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.BAD_REQUEST));
            assertThat(statistics.getPrepareStatementCount()).isEqualTo(statementsBefore);
        } finally {
            statistics.setStatisticsEnabled(wasEnabled);
        }
    }

    private Member waitingDirectoryOwner(String suffix) {
        Member owner = Member.builder().name("웨이팅 탐색 검증")
                .email("waiting-directory-" + suffix + "-" + UUID.randomUUID() + "@example.test")
                .role(Role.BUSINESS).build();
        em.persist(owner);
        return owner;
    }

    private Store waitingDirectoryStore(Member owner, String name, String address, WaitingIntakeMode mode,
                                        boolean paused, double rating, int reviews) {
        Store store = Store.builder().owner(owner).name(name).address(address).waitingIntakeMode(mode)
                .waitingPaused(paused).rating(rating).reviewCount(reviews).build();
        em.persist(store);
        return store;
    }

    private void assertWaitingDirectoryPages(String keyword, CustomerWaitingService.DirectoryFilters filters,
                                             List<Long> expectedIds) {
        for (int page = 0; page < expectedIds.size(); page++) {
            var result = waiting.directory(keyword, page, 1, filters);
            assertThat(result.getTotalElements()).as(filters + " page " + page).isEqualTo(expectedIds.size());
            assertThat(result.getContent()).as(filters + " page " + page)
                    .extracting(StoreResponse::getId).containsExactly(expectedIds.get(page));
        }
        var afterLastPage = waiting.directory(keyword, expectedIds.size(), 1, filters);
        assertThat(afterLastPage.getTotalElements()).isEqualTo(expectedIds.size());
        assertThat(afterLastPage.getContent()).isEmpty();
    }
}
