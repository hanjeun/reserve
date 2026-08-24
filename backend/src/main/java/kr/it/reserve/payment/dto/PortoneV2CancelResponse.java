package kr.it.reserve.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;

/**
 * 포트원 V2 결제 취소(환불) 응답 — 2026-08-23 신설.
 * {@code POST https://api.portone.io/payments/{paymentId}/cancel}
 *
 * <h2>★ 왜 이 DTO 가 생겼나</h2>
 * 예전에는 취소 호출의 응답 타입이 {@code Void} 라 <b>본문을 통째로 버렸다.</b>
 * 그래서 HTTP 200 만 오면 무조건 "환불 완료"로 기록했는데, PortOne V2 의 취소는
 * <b>비동기로 끝날 수 있다</b> — 200 을 주면서 {@code status: "REQUESTED"} 를 돌려주는 경우다.
 * 그 상태는 "취소 요청을 접수했다"는 뜻이지 <b>돈이 돌아갔다는 뜻이 아니다.</b>
 * 접수 뒤 PG 쪽에서 실패하면, 우리 DB 에는 REFUNDED 로 남고 손님 돈은 안 돌아간
 * <b>가장 나쁜 어긋남</b>이 생긴다.
 *
 * <p>응답 형태는 {@code { "cancellation": { "status": ..., ... } }} 이고
 * {@code status} 는 {@code SUCCEEDED} · {@code REQUESTED} · {@code FAILED} 셋 중 하나다
 * (PortOne V2 REST 문서의 {@code CancelPaymentResponse} / {@code PaymentCancellation}).
 *
 * <p>모르는 필드는 무시한다 — PG 응답에 필드가 늘어난다고 환불이 깨지면 안 된다.
 */
@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class PortoneV2CancelResponse {

    private Cancellation cancellation;

    @Getter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Cancellation {
        /** SUCCEEDED · REQUESTED · FAILED */
        private String status;

        /** PortOne 이 부여한 취소 건 식별자. 원장(RefundAttempt)에 남겨 나중에 대조한다. */
        private String id;

        /** 실제로 취소된 총액. PG 가 우리 요청과 다른 값을 돌려줄 수 있으므로 그대로 기록한다. */
        private Integer totalAmount;

        /** FAILED 일 때만 채워진다. 사용자에게 보여주지 말고 로그·원장에만 남긴다. */
        private String reason;
    }

    /**
     * 취소 결과 상태. <b>응답이 비어 있으면 {@link Status#UNKNOWN}</b> 이다 —
     * "성공"으로 낙관하지 않는다. 알 수 없으면 원장에 미결로 남기고 사람이 확인해야 한다.
     */
    public Status resolveStatus() {
        if (cancellation == null || cancellation.getStatus() == null) {
            return Status.UNKNOWN;
        }
        return switch (cancellation.getStatus()) {
            case "SUCCEEDED" -> Status.SUCCEEDED;
            case "REQUESTED" -> Status.REQUESTED;
            case "FAILED" -> Status.FAILED;
            default -> Status.UNKNOWN;
        };
    }

    public String cancellationId() {
        return cancellation != null ? cancellation.getId() : null;
    }

    public Integer cancelledAmount() {
        return cancellation != null ? cancellation.getTotalAmount() : null;
    }

    public String failureReason() {
        return cancellation != null ? cancellation.getReason() : null;
    }

    public enum Status {
        /** 돈이 실제로 돌아갔다. 이때만 결제를 환불 완료로 기록한다. */
        SUCCEEDED,
        /** 접수만 됐다. 아직 환불이 아니다 — 웹훅이나 재조회로 결말을 확인해야 한다. */
        REQUESTED,
        /** PG 가 거절했다. */
        FAILED,
        /** 본문이 없거나 모르는 값. REQUESTED 와 같게 취급한다(낙관하지 않는다). */
        UNKNOWN
    }
}
