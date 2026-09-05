package kr.it.reserve.reservation.dto;

import kr.it.reserve.reservation.entity.Reservation;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

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
     * 가게가 취소한 사유 (2026-08-11 추가). {@code rejectionReason} 과 <b>합치면 안 된다</b> —
     * 화면이 그 필드를 "거절 사유"라는 라벨로 보여주기 때문에, 취소 건에 그 라벨이 붙으면
     * 이용자가 무슨 일이 있었는지 오해한다.
     */
    private String cancelReason;


    // 결제 관련 필드
    private Boolean depositPaid;
    private Integer depositAmount;
    private Integer noShowDeposit;  // 가게의 노쇼방지금 설정 금액
    private LocalDateTime checkedInAt;

    // 미결제 예약의 만료 안내에 필요한 가게 설정 (2026-07-29 추가).
    // 프론트가 "결제하기" 버튼을 그릴 때 이 값들이 없어서 depositPaid만 보고 판단했고,
    // 그 결과 나중 결제를 끈 가게에서도 결제 버튼이 그대로 노출됐다.
    // 만료 "시각"이 아니라 "소요 분"만 내려준다 — 컨테이너에 TZ 설정이 없어(Dockerfile·compose·yml 모두)
    // LocalDateTime이 UTC로 나갈 수 있고, 그대로 브라우저에서 렌더하면 9시간 어긋난다.
    private Boolean allowLatePayment;         // false면 paymentTimeoutMinutes 뒤 자동 취소 대상
    private Integer paymentTimeoutMinutes;    // null이면 서버 기본값 30분

    // 리뷰 관련 필드 (null = 아직 리뷰 미작성)
    private Long reviewId;

    /**
     * ★ 필드를 추가할 땐 {@link #fromEntityWithReviewId} 한 곳만 고치면 된다 (2026-08-11 정리).
     * 예전엔 두 팩토리가 같은 빌더 체인을 통째로 복사해 갖고 있어서, 새 필드를 한쪽에만 넣으면
     * <b>화면에 따라 값이 있다 없다</b> 했다(목록엔 뜨는데 상세엔 안 뜨는 식). 이제 위임한다.
     */
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
                .checkedInAt(reservation.getCheckedInAt())
                .allowLatePayment(reservation.getStore().getAllowLatePayment())
                .paymentTimeoutMinutes(reservation.getStore().getPaymentTimeoutMinutes())
                .reviewId(reviewId)
                .build();
    }
}
