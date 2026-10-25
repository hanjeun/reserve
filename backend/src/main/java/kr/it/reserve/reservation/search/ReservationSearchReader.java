package kr.it.reserve.reservation.search;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

/** 소유권·표시 기간을 DB에서 확인한 제한된 검색 결과만 제공한다. */
public interface ReservationSearchReader {
    record Hit(Long id, String storeName, String code, LocalDate date, LocalTime time) {}
    List<Hit> search(Long memberId, String pattern, LocalDate date, int limit);
}
