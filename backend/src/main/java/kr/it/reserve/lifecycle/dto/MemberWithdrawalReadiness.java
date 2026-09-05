package kr.it.reserve.lifecycle.dto;

/** 회원 탈퇴 전에 해결해야 하는 소유 자원과 금전 미결 상태. */
public record MemberWithdrawalReadiness(
        long openStores,
        int unresolvedReservations,
        long unresolvedRefunds,
        long openPaymentIssues,
        long unfinishedWebhooks) {

    public boolean canWithdraw() {
        return openStores == 0
                && unresolvedReservations == 0
                && unresolvedRefunds == 0
                && openPaymentIssues == 0
                && unfinishedWebhooks == 0;
    }
}
