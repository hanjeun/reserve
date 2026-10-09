package kr.it.reserve.advertisement.dto;

import jakarta.validation.constraints.NotNull;

/**
 * 예약 생성 뒤 광고 전환을 귀속할 때 쓰는 요청이다.
 *
 * <p>광고 ID는 경로에서 받고, 예약 ID는 본문에서 받는다. 둘 다 서버에서 현재 로그인 회원과
 * 가게를 다시 대조하므로 클라이언트 값만으로 카운터가 늘어나지 않는다.
 */
public record AdConversionRequest(
        @NotNull(message = "reservationId는 필수예요.")
        Long reservationId
) {
}
