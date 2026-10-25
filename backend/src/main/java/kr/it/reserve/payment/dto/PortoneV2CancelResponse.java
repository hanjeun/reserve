package kr.it.reserve.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Getter;

/**
 * {@code POST https://api.portone.io/payments/{paymentId}/cancel}의 cancellation 응답이다.
 * HTTP 성공과 실제 환불 완료를 구분해 SUCCEEDED·REQUESTED·FAILED 상태를 읽는다.
 * 본문·상태가 없거나 알 수 없으면 UNKNOWN으로 남기며 환불 완료로 추정하지 않는다.
 * 취소 ID와 금액은 원장 대사에 사용하고 추가 응답 필드는 허용한다.
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
