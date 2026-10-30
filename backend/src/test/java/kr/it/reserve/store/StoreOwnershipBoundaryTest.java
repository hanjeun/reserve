package kr.it.reserve.store;

import kr.it.reserve.favorite.repository.FavoriteRepository;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.dto.StoreUpdateRequest;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.repository.StoreRepository;
import kr.it.reserve.store.service.StoreService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class StoreOwnershipBoundaryTest {
    private enum Operation { UPDATE, AUTO_APPROVAL, RESERVATION_COUNT, CLOSURE_READINESS, CLOSE }

    @Mock StoreRepository stores;
    @Mock ReservationRepository reservations;
    @Mock DataLifecycleGuard lifecycle;
    @Mock FileStorageService files;
    @Mock FileDeletionOutboxService deletions;
    @Mock FavoriteRepository favorites;
    @Mock PromotionRepository promotions;
    @Mock ApplicationEventPublisher events;
    @InjectMocks StoreService service;

    @ParameterizedTest
    @EnumSource(Operation.class)
    void ownerlessStoreDoesNotGrantBusinessMemberAccess(Operation operation) {
        var actor = Member.builder().id(9L).role(Role.BUSINESS).build();
        var store = Store.builder().id(31L).name("원래 가게").autoApprovalEnabled(false).build();
        if (operation == Operation.UPDATE || operation == Operation.CLOSE) {
            when(stores.findByIdForUpdate(31L)).thenReturn(Optional.of(store));
        } else {
            when(stores.findById(31L)).thenReturn(Optional.of(store));
        }

        assertThatThrownBy(() -> request(operation, actor))
                .isInstanceOfSatisfying(StoreException.class,
                        error -> assertThat(error.getStatus()).isEqualTo(HttpStatus.FORBIDDEN));

        assertThat(store.getName()).isEqualTo("원래 가게");
        assertThat(store.getAutoApprovalEnabled()).isFalse();
        assertThat(store.isDeleted()).isFalse();
        if (operation == Operation.UPDATE || operation == Operation.CLOSE) verify(stores).findByIdForUpdate(31L);
        else verify(stores).findById(31L);
        verifyNoMoreInteractions(stores);
        verifyNoInteractions(reservations, lifecycle, files, deletions, favorites, promotions, events);
    }

    @Test
    void actualOwnerCanStillReadReservationCount() {
        var owner = Member.builder().id(9L).role(Role.BUSINESS).build();
        var store = Store.builder().id(31L).owner(owner).build();
        when(stores.findById(31L)).thenReturn(Optional.of(store));
        when(reservations.countActiveReservationsByStoreId(31L)).thenReturn(3);

        assertThat(service.countActiveReservations(31L, owner)).isEqualTo(3);
    }

    private void request(Operation operation, Member actor) {
        switch (operation) {
            case UPDATE -> {
                var request = new StoreUpdateRequest();
                request.setName("변경 시도");
                service.updateStore(31L, request, actor);
            }
            case AUTO_APPROVAL -> service.toggleAutoApproval(31L, true, actor);
            case RESERVATION_COUNT -> service.countActiveReservations(31L, actor);
            case CLOSURE_READINESS -> service.getClosureReadiness(31L, actor);
            case CLOSE -> service.deleteStore(31L, actor);
        }
    }
}
