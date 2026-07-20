package com.reserve.reservation.dto;

import com.reserve.reservation.entity.Reservation;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalTime;

@Getter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReservationResponse {
    
    private Long id;
    private String reservationCode;
    private Long storeId;
    private String storeName;
    private String storeMainImageUrl;
    private Long memberId;
    private String memberName;
    private String memberEmail;
    private LocalDate reservationDate;
    private LocalTime reservationTime;
    private Integer guestCount;
    private String status;
    private String specialRequest;
    private String rejectionReason;
    
    // 결제 관련 필드
    private Boolean depositPaid;
    private Integer depositAmount;
    private Integer noShowDeposit;  // 가게의 노쇼방지금 설정 금액

    // 리뷰 관련 필드 (null = 아직 리뷰 미작성)
    private Long reviewId;

    public static ReservationResponse fromEntity(Reservation reservation) {
        return ReservationResponse.builder()
                .id(reservation.getId())
                .reservationCode(reservation.getReservationCode())
                .storeId(reservation.getStore().getId())
                .storeName(reservation.getStore().getName())
                .storeMainImageUrl(reservation.getStore().getMainImageUrl())
                .memberId(reservation.getMember().getId())
                .memberName(reservation.getMember().getName())
                .memberEmail(reservation.getMember().getEmail())
                .reservationDate(reservation.getReservationDate())
                .reservationTime(reservation.getReservationTime())
                .guestCount(reservation.getGuestCount())
                .status(reservation.getStatus().name())
                .specialRequest(reservation.getSpecialRequest())
                .rejectionReason(reservation.getRejectionReason())
                .depositPaid(reservation.getDepositPaid())
                .depositAmount(reservation.getDepositAmount())
                .noShowDeposit(reservation.getStore().getNoShowDeposit())
                .reviewId(null)  // 기본값 null, 서비스에서 set
                .build();
    }

    /** 리뷰 ID를 포함한 응답 생성 (내 예약 목록 전용) */
    public static ReservationResponse fromEntityWithReviewId(Reservation reservation, Long reviewId) {
        return ReservationResponse.builder()
                .id(reservation.getId())
                .reservationCode(reservation.getReservationCode())
                .storeId(reservation.getStore().getId())
                .storeName(reservation.getStore().getName())
                .storeMainImageUrl(reservation.getStore().getMainImageUrl())
                .memberId(reservation.getMember().getId())
                .memberName(reservation.getMember().getName())
                .memberEmail(reservation.getMember().getEmail())
                .reservationDate(reservation.getReservationDate())
                .reservationTime(reservation.getReservationTime())
                .guestCount(reservation.getGuestCount())
                .status(reservation.getStatus().name())
                .specialRequest(reservation.getSpecialRequest())
                .rejectionReason(reservation.getRejectionReason())
                .depositPaid(reservation.getDepositPaid())
                .depositAmount(reservation.getDepositAmount())
                .noShowDeposit(reservation.getStore().getNoShowDeposit())
                .reviewId(reviewId)
                .build();
    }
}
