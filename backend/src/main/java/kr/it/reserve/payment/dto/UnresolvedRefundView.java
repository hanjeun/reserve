package kr.it.reserve.payment.dto;

/** PG 재조회는 트랜잭션 밖에서 수행하므로 엔티티 대신 필요한 값만 반환한다. */
public record UnresolvedRefundView(
        Long attemptId,
        Long paymentId,
        String merchantUid,
        Integer requestedAmount,
        String cancellationId,
        String reason,
        int resolveAttempts
) {
}
