package kr.it.reserve.reservation;

import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationService;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ReservationMyPageServiceTest {
    @Mock ReservationRepository repository;
    @InjectMocks ReservationService service;

    @Test
    void memberFiltersBoundedPageAndReviewLookupApplyOnlyToTheReturnedPage() {
        Member member = Member.builder().id(7L).name("예약자").build();
        Store store = Store.builder().id(10L).name("가게").build();
        Reservation completed = Reservation.builder().id(23L).member(member).store(store)
                .status(Reservation.ReservationStatus.COMPLETED).build();
        Reservation pending = Reservation.builder().id(24L).member(member).store(store)
                .status(Reservation.ReservationStatus.PENDING).build();
        var pageable = PageRequest.of(2, 15, Sort.by(Sort.Direction.ASC, "reservationDate", "reservationTime", "id"));
        when(repository.searchForMember(member, "100!%!_!!", null, pageable))
                .thenReturn(new PageImpl<>(List.of(completed, pending), pageable, 32));
        when(repository.findReviewIdsByReservationIds(List.of(23L))).thenReturn(List.<Object[]>of(new Object[]{23L, 99L}));

        var result = service.getMyReservations(member, 2, 15, " 100%_! ", null, "visit");

        assertThat(result.getTotalElements()).isEqualTo(32);
        assertThat(result.getContent()).extracting("id").containsExactly(23L, 24L);
        assertThat(result.getContent().getFirst().getReviewId()).isEqualTo(99L);
        assertThat(result.getContent().getLast().getReviewId()).isNull();
        verify(repository).findReviewIdsByReservationIds(List.of(23L));
    }

    @Test
    void oversizedAndNegativePaginationCannotTriggerAnUnboundedQuery() {
        Member member = Member.builder().id(8L).build();
        when(repository.searchForMember(any(), any(), any(), any())).thenReturn(new PageImpl<>(List.of()));

        service.getMyReservations(member, -2, Integer.MAX_VALUE, null, Reservation.ReservationStatus.PENDING, "oldest");

        verify(repository).searchForMember(member, "", Reservation.ReservationStatus.PENDING,
                PageRequest.of(0, 100, Sort.by(Sort.Direction.ASC, "createdAt", "id")));
        verify(repository, never()).findReviewIdsByReservationIds(any());
        assertThatThrownBy(() -> service.getMyReservations(member, Integer.MAX_VALUE, 15, null, null, "recent"))
                .isInstanceOf(kr.it.reserve.global.error.BusinessException.class);
        verifyNoMoreInteractions(repository);
    }

    @Test
    void anEmptyPageDoesNotTriggerAnyAdditionalHistoryLookup() {
        Member member = Member.builder().id(7L).build();
        var pageable = PageRequest.of(0, 15, Sort.by(Sort.Direction.DESC, "createdAt", "id"));
        when(repository.searchForMember(member, "", null, pageable)).thenReturn(new PageImpl<>(List.of(), pageable, 0));

        assertThat(service.getMyReservations(member, 0, 15, null, null, "recent")).isEmpty();
        verify(repository).searchForMember(member, "", null, pageable);
        verifyNoMoreInteractions(repository);
    }
}
