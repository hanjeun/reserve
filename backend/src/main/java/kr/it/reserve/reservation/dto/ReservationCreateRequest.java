package kr.it.reserve.reservation.dto;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.FutureOrPresent;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class ReservationCreateRequest {
    
    @NotNull(message = "가게 ID는 필수입니다.")
    private Long storeId;
    
    @NotNull(message = "예약 날짜는 필수입니다.")
    @FutureOrPresent(message = "예약 날짜는 현재 이후여야 합니다.")
    private LocalDate reservationDate;
    
    @NotNull(message = "예약 시간은 필수입니다.")
    private LocalTime reservationTime;
    
    @NotNull(message = "예약 인원은 필수입니다.")
    @Min(value = 1, message = "예약 인원은 최소 1명 이상이어야 합니다.")
    private Integer guestCount;
    
    private String specialRequest;

    // 나중 결제 허용 여부 체크용 (true = 예약금 있어도 나중에 결제하겠다는 의사)
    private Boolean skipPayment;
}
