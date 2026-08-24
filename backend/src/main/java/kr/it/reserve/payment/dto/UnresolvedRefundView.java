package kr.it.reserve.payment.dto;

/**
 * 미결 환불 재조회용 <b>평면 조회 결과</b> — 2026-08-23 신설.
 *
 * <p>엔티티를 그대로 들고 나가지 않는 이유: 재조회 루프는 <b>트랜잭션 밖</b>에서 돈다
 * (안에서 느린 PG HTTP 호출을 하기 때문에 — {@code RefundReconciliationScheduler} 주석 참고).
 * 필요한 값만 미리 뽑아 나오면 영속성 컨텍스트가 닫힌 뒤에도 안전하고, 목록이 커져도
 * 엔티티를 통째로 메모리에 올리지 않는다.
 */
public record UnresolvedRefundView(
        Long attemptId,
        Long paymentId,
        String merchantUid,
        Integer requestedAmount,
        String reason,
        int resolveAttempts
) {
}
