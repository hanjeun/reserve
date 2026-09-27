package kr.it.reserve.advertisement;

import jakarta.persistence.EntityManager;
import kr.it.reserve.advertisement.entity.AdStatus;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class AdvertisementStatisticsSelectionTest {

    @Autowired
    private EntityManager entityManager;

    @Autowired
    private AdvertisementRepository advertisementRepository;

    @Test
    void activeSummarySelectsTheNearestRealEndDate() {
        Member owner = Member.builder()
                .name("광고 검증")
                .email(UUID.randomUUID() + "@example.test")
                .role(Role.BUSINESS)
                .build();
        entityManager.persist(owner);
        Store store = Store.builder().name("광고 종료일 검증").owner(owner).build();
        entityManager.persist(store);

        LocalDate today = LocalDate.of(2026, 9, 11);
        Advertisement later = persistAdvertisement(store, today.minusDays(1), today.plusDays(20));
        Advertisement nearest = persistAdvertisement(store, today.minusDays(10), today.plusDays(2));
        persistAdvertisement(store, today.plusDays(1), today.plusDays(1));
        entityManager.flush();

        Advertisement selected = advertisementRepository
                .findFirstByStoreIdAndStatusAndStartDateLessThanEqualAndEndDateGreaterThanEqualOrderByEndDateAscIdAsc(
                        store.getId(), AdStatus.ACTIVE, today, today)
                .orElseThrow();

        assertThat(selected.getId()).isEqualTo(nearest.getId());
        assertThat(selected.getId()).isNotEqualTo(later.getId());
    }

    private Advertisement persistAdvertisement(Store store, LocalDate startDate, LocalDate endDate) {
        Advertisement advertisement = Advertisement.builder()
                .store(store)
                .adType(AdType.BADGE)
                .startDate(startDate)
                .endDate(endDate)
                .amount(1_000)
                .merchantUid("ad-stats-" + UUID.randomUUID())
                .status(AdStatus.ACTIVE)
                .build();
        entityManager.persist(advertisement);
        return advertisement;
    }
}
