package kr.it.reserve.store.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Embeddable
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class BookingOpening {
    @Column(name = "booking_opens_at")
    private LocalDateTime opensAt;

    @Column(name = "booking_opening_from")
    private LocalDate from;

    @Column(name = "booking_opening_to")
    private LocalDate to;

    public BookingOpening(LocalDateTime opensAt, LocalDate from, LocalDate to) {
        this.opensAt = opensAt;
        this.from = from;
        this.to = to;
    }

    public boolean pendingOn(LocalDate visitDate, LocalDateTime now) {
        return now.isBefore(opensAt) && !visitDate.isBefore(from) && !visitDate.isAfter(to);
    }
}
