package kr.it.reserve.lifecycle.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

/** 회원 탈퇴 전에 해결해야 하는 소유 자원과 금전 미결 상태. */
public record MemberWithdrawalReadiness(
        long openStores,
        int unresolvedReservations,
        long unresolvedRefunds,
        long openPaymentIssues,
        long unfinishedWebhooks) {

    /**
     * record 파생 메서드는 컴포넌트가 아니어서 Jackson이 기본으로 직렬화하지 않는다.
     * 프런트가 readiness.canWithdraw 로 버튼을 켜므로 @JsonProperty 로 응답에 반드시 실어야 한다.
     */
    @JsonProperty("canWithdraw")
    public boolean canWithdraw() {
        return openStores == 0
                && unresolvedReservations == 0
                && unresolvedRefunds == 0
                && openPaymentIssues == 0
                && unfinishedWebhooks == 0;
    }
}
