package kr.it.reserve.lifecycle.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** 가게 영업 종료 전에 반드시 0이어야 하는 운영 의무를 한 응답에 모은다. */
public record StoreClosureReadiness(
        int unresolvedReservations,
        long activeAdvertisements,
        long unresolvedRefunds,
        long openPaymentIssues,
        long unfinishedWebhooks) {

    /**
     * record 파생 메서드는 컴포넌트가 아니어서 Jackson이 기본으로 직렬화하지 않는다.
     * 프런트가 readiness.canClose 로 버튼을 켜므로 @JsonProperty 로 응답에 반드시 실어야 한다.
     */
    @JsonProperty("canClose")
    public boolean canClose() {
        return unresolvedReservations == 0
                && activeAdvertisements == 0
                && unresolvedRefunds == 0
                && openPaymentIssues == 0
                && unfinishedWebhooks == 0;
    }
}
