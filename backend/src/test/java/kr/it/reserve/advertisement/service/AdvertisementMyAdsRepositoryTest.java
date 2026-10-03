package kr.it.reserve.advertisement.service;

import jakarta.persistence.EntityManager;
import kr.it.reserve.advertisement.dto.AdvertisementResponse;
import kr.it.reserve.advertisement.entity.AdType;
import kr.it.reserve.advertisement.entity.Advertisement;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@Transactional
class AdvertisementMyAdsRepositoryTest {

    @Autowired EntityManager entityManager;
    @Autowired AdvertisementService advertisementService;

    @Test
    void ownerStoreAndLiteralSearchApplyToContentCountAndStablePages() {
        Member owner = member("ad-page-owner@example.test");
        Member otherOwner = member("ad-page-other@example.test");
        Store literalStore = store(owner, "50%!_ Studio");
        Store wildcardOnlyStore = store(owner, "50XYZ Studio");
        Store otherOwnersStore = store(otherOwner, "50%!_ Studio");
        LocalDateTime sameCreatedAt = LocalDateTime.of(2026, 9, 22, 12, 0);

        Advertisement older = advertisement(literalStore, sameCreatedAt);
        Advertisement newer = advertisement(literalStore, sameCreatedAt);
        advertisement(wildcardOnlyStore, sameCreatedAt);
        advertisement(otherOwnersStore, sameCreatedAt);
        Advertisement deleted = advertisement(literalStore, sameCreatedAt.plusMinutes(1));
        deleted.softDelete();
        entityManager.flush();

        var first = advertisementService.getMyAds(owner, 0, 1, null, "50%!_ Studio");
        var second = advertisementService.getMyAds(owner, 1, 1, null, "50%!_ Studio");

        assertThat(first.getTotalElements()).isEqualTo(2);
        assertThat(first.getTotalPages()).isEqualTo(2);
        assertThat(first.getContent()).extracting(AdvertisementResponse::getId)
                .containsExactly(newer.getId());
        assertThat(second.getTotalElements()).isEqualTo(2);
        assertThat(second.getContent()).extracting(AdvertisementResponse::getId)
                .containsExactly(older.getId());

        var exactStore = advertisementService.getMyAds(
                owner, 0, 20, wildcardOnlyStore.getId(), "Studio");
        assertThat(exactStore.getTotalElements()).isEqualTo(1);
        assertThat(exactStore.getContent()).extracting(AdvertisementResponse::getStoreId)
                .containsExactly(wildcardOnlyStore.getId());
    }

    private Member member(String email) {
        Member member = Member.builder().name("광고 목록 검증").email(email).role(Role.BUSINESS).build();
        entityManager.persist(member);
        return member;
    }

    private Store store(Member owner, String name) {
        Store store = Store.builder().owner(owner).name(name).build();
        entityManager.persist(store);
        return store;
    }

    private Advertisement advertisement(Store store, LocalDateTime createdAt) {
        Advertisement advertisement = Advertisement.builder()
                .store(store)
                .adType(AdType.BADGE)
                .startDate(ServiceTime.today())
                .endDate(ServiceTime.today().plusDays(1))
                .amount(1_000)
                .merchantUid("AD-" + UUID.randomUUID())
                .createdAt(createdAt)
                .build();
        entityManager.persist(advertisement);
        return advertisement;
    }
}
