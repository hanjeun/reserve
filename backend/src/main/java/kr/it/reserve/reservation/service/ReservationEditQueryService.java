package kr.it.reserve.reservation.service;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.reservation.dto.CalendarDayResponse;
import kr.it.reserve.reservation.dto.SlotAvailabilityResponse;
import kr.it.reserve.reservation.entity.Reservation;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.dto.StoreResponse;
import kr.it.reserve.store.entity.Store;
import kr.it.reserve.store.service.StoreService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.List;

/** Existing reservations can be edited during emergency admission without opening public discovery reads. */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReservationEditQueryService {
    private final ReservationRepository reservations;
    private final ReservationService reservationService;
    private final StoreService storeService;

    public StoreResponse getEditStore(Long id, Long expectedStoreId, Member member) {
        return storeService.getStore(editableStore(id, expectedStoreId, member).getId());
    }

    public List<SlotAvailabilityResponse> getEditAvailability(Long id, Long expectedStoreId, LocalDate date, Member member) {
        return reservationService.getAvailability(editableStore(id, expectedStoreId, member).getId(), date);
    }

    public List<CalendarDayResponse> getEditCalendar(Long id, Long expectedStoreId, YearMonth month, Member member) {
        return reservationService.getMonthCalendar(editableStore(id, expectedStoreId, member).getId(), month);
    }

    private Store editableStore(Long id, Long expectedStoreId, Member member) {
        Reservation reservation = reservations.findById(id)
                .filter(row -> !row.isDeleted())
                .orElseThrow(() -> new ReservationException("예약을 찾을 수 없어요.", HttpStatus.NOT_FOUND));
        ReservationAccess.editable(reservation, member);
        Store store = reservation.getStore();
        if (!store.getId().equals(expectedStoreId)) {
            throw new ReservationException("이 가게의 예약이 아니에요.", HttpStatus.BAD_REQUEST);
        }
        if (store.isDeleted() || store.isSuspended()) {
            throw new ReservationException("가게를 찾을 수 없어요.", HttpStatus.NOT_FOUND);
        }
        if (store.getOwner() != null && store.getOwner().isSuspended()) {
            throw new ReservationException("현재 운영이 중단된 가게예요. 예약을 변경할 수 없어요.", HttpStatus.BAD_REQUEST);
        }
        return store;
    }
}
