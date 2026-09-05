package kr.it.reserve.reservation.dto;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * QR 체크인 결과 (2026-08-11 신설).
 *
 * <p><b>왜 {@link ReservationResponse} 를 그대로 안 쓰나</b> — 화면이 "방금 체크인했다"와
 * "이미 체크인돼 있었다"를 구분해서 보여줘야 하는데, 예약 응답만으로는 알 수 없다.
 * 체크인은 <b>멱등</b>이라 같은 QR 을 두 번 스캔해도 성공하고, 그때 돌아오는 예약 상태는
 * 두 경우 모두 예약 승인 상태는 그대로라 구분할 수 없다.
 *
 * <p><b>왜 {@code ApiResponse.message} 로 안 내리나</b> — axios 인터셉터가 성공 응답에서
 * {@code data} 만 꺼내고 {@code message} 는 버린다({@code frontend/src/api/axios.js}).
 * 그래서 구분값은 <b>데이터 안에</b> 있어야 화면까지 닿는다.
 *
 * <p>{@code ReservationResponse} 에 필드를 얹지 않은 건, 그 DTO 가 목록·상세 등 여러 화면이
 * 공유하는데 거기서는 항상 {@code null} 인 필드가 따라다니게 되기 때문이다.
 */
@Getter
@AllArgsConstructor
public class QrCheckinResponse {

    private final ReservationResponse reservation;

    /** {@code true} 면 이 스캔 이전에 이미 출석 기록이 있었다(= 이번 스캔으로 바뀐 게 없다). */
    private final boolean alreadyCheckedIn;
}
