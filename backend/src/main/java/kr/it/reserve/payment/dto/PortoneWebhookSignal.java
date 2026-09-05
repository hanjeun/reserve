package kr.it.reserve.payment.dto;

/**
 * 서명 검증을 통과한 웹훅 본문에서 꺼낸 최소 신호.
 * 원문 상태는 신뢰하지 않으며 실제 결제 상태는 PortOne 조회 API에서 다시 확인한다.
 */
public record PortoneWebhookSignal(
        String eventType,
        String merchantUid,
        boolean validJson
) {
    public static PortoneWebhookSignal invalidJson() {
        return new PortoneWebhookSignal("INVALID_JSON", null, false);
    }
}
