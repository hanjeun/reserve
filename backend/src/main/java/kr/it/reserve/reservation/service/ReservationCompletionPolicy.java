package kr.it.reserve.reservation.service;

import kr.it.reserve.global.error.ReservationException;
import kr.it.reserve.store.entity.Store;
import org.springframework.http.HttpStatus;
import java.time.*;

public final class ReservationCompletionPolicy {
    private ReservationCompletionPolicy() { }
    // 이전 스키마의 0은 미설정 값이며 새 설정 입력과 구분한다.
    public static int storedDuration(Integer value) { return duration(value != null && value == 0 ? null : value); }
    public static int duration(Integer value) {
        int duration = value == null ? 60 : value;
        if (duration < 1 || duration > 1440) throw new ReservationException("이용 시간은 1~1,440분 사이로 입력해주세요.", HttpStatus.BAD_REQUEST);
        return duration;
    }
    public static LocalDateTime endsAt(Store store, LocalDate date, LocalTime time, Integer minutes) {
        if (store.resolveBookingType() == Store.BookingType.DAY) {
            LocalTime close = store.getCloseTime();
            if (close == null) return date.plusDays(1).atStartOfDay();
            boolean overnight = store.getOpenTime() != null && !close.isAfter(store.getOpenTime());
            return (overnight ? date.plusDays(1) : date).atTime(close);
        }
        return date.atTime(time).plusMinutes(duration(minutes));
    }
}
