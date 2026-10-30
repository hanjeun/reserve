package kr.it.reserve.reservation.dto;

import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.reservation.entity.Reservation;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.time.Instant;
import java.time.ZoneId;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.LocalDateTime;

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

    /**
     * 가게가 취소한 사유. {@code rejectionReason} 과 <b>합치면 안 된다</b> —
     * 화면이 그 필드를 "거절 사유"라는 라벨로 보여주기 때문에, 취소 건에 그 라벨이 붙으면
     * 이용자가 무슨 일이 있었는지 오해한다.
     */
    private String cancelReason;

    // 결제 관련 필드
    private Boolean depositPaid;
    private Integer depositAmount;
    private Integer noShowDeposit;  // 가게의 노쇼방지금 설정 금액
    private LocalDateTime checkedInAt;
    private LocalDateTime usageEndsAt;
    private Boolean autoCompletionEnabled;
    private Boolean attendanceRefundEnabled;

    private Boolean allowLatePayment;
    private Integer paymentTimeoutMinutes;
    private Instant paymentDeadline;

    // 리뷰 관련 필드 (null = 아직 리뷰 미작성)
    private Long reviewId;
    private boolean personalInfoHidden;
    private Instant personalInfoVisibleUntil;

    public static ReservationResponse fromManagementEntity(Reservation reservation) {
        ReservationResponse response = fromEntity(reservation);
        var until = kr.it.reserve.reservation.retention.ReservationPrivacyPolicy.visibleUntil(reservation);
        response.personalInfoVisibleUntil = until == null ? null : until.atZone(ServiceTime.ZONE).toInstant();
        response.personalInfoHidden = kr.it.reserve.reservation.retention.ReservationPrivacyPolicy.hidden(reservation, ServiceTime.now());
        if (response.personalInfoHidden) {
            response.memberId = null; response.memberName = null; response.memberEmail = null;
            response.specialRequest = null; response.rejectionReason = null; response.cancelReason = null;
        }
        return response;
    }

    // 만료 작업과 같은 저장 시계를 쓰고 브라우저에는 시간대가 있는 시각을 전달한다.
    private static Instant paymentDeadline(Reservation reservation) {
        var deadline = kr.it.reserve.reservation.service.ReservationPaymentPolicy.deadline(reservation);
        return deadline == null ? null : deadline.atZone(ZoneId.systemDefault()).toInstant();
    }

    public static ReservationResponse fromEntity(Reservation reservation) {
        return fromEntityWithReviewId(reservation, null);
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
                .cancelReason(reservation.getCancelReason())
                .depositPaid(reservation.getDepositPaid())
                .depositAmount(reservation.getDepositAmount())
                .noShowDeposit(reservation.getStore().getNoShowDeposit())
                .checkedInAt(ServiceTime.toServiceZone(reservation.getCheckedInAt()))
                .usageEndsAt(reservation.getUsageEndsAt())
                .autoCompletionEnabled(reservation.getAutoCompletionEnabled())
                .attendanceRefundEnabled(reservation.getAttendanceRefundEnabled())
                .allowLatePayment(reservation.getStore().getAllowLatePayment())
                .paymentTimeoutMinutes(reservation.getStore().getPaymentTimeoutMinutes())
                .paymentDeadline(paymentDeadline(reservation))
                .reviewId(reviewId)
                .build();
    }
}
