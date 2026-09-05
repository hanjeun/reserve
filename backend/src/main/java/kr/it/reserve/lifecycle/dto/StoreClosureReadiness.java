package kr.it.reserve.lifecycle.dto;

/** 가게 영업 종료 전에 반드시 0이어야 하는 운영 의무를 한 응답에 모은다. */
public record StoreClosureReadiness(
        int unresolvedReservations,
        long activeAdvertisements,
        long unresolvedRefunds,
        long openPaymentIssues,
        long unfinishedWebhooks) {

    public boolean canClose() {
        return unresolvedReservations == 0
                && activeAdvertisements == 0
                && unresolvedRefunds == 0
                && openPaymentIssues == 0
                && unfinishedWebhooks == 0;
    }
}
