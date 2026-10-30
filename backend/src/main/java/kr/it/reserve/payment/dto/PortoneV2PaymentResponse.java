package kr.it.reserve.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

/**
 * 포트원 V2 API 결제 조회 응답
 * GET https://api.portone.io/payments/{paymentId}
 */
@Getter
@JsonIgnoreProperties(ignoreUnknown = true)
public class PortoneV2PaymentResponse {

    // V2 paymentId = merchant_uid (우리가 생성한 주문번호)
    @JsonAlias("id")
    private String paymentId;
    private String currency;
    private Channel channel;
    private String storeId;
    private java.util.List<Dispute> disputes;
    @Getter @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Dispute { private String status; }

    @Getter @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Channel {
        private String type;
        private String id;
        private String pgProvider;
        private String pgMerchantId;
    }

    // V2 status: READY, PAID, FAILED, CANCELLED, PARTIAL_CANCELLED
    private String status;

    private Amount amount;

    private Method method;

    private java.util.List<PortoneV2CancelResponse.Cancellation> cancellations;

    /** 접수 중이거나 해석할 수 없는 취소가 있으면 새 취소를 발신하지 않는다. */
    public boolean hasUnsettledCancellation() {
        return cancellations != null && cancellations.stream().anyMatch(value -> value == null
                || (!"SUCCEEDED".equals(value.getStatus()) && !"FAILED".equals(value.getStatus())));
    }

    // PG사 거래번호 (V1의 imp_uid에 해당)
    private String pgTxId;

    @Getter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Amount {
        private int total;
        private Long cancelled;
    }

    @Getter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Method {
        // "EasyPay", "Card", "Transfer" 등
        private String type;
        private String provider;

        // 이전 응답의 중첩 제공사도 읽는다.
        // EasyPay 제공사: "KakaoPay", "NaverPay" 등
        @JsonProperty("easyPay")
        private EasyPay easyPay;

        public String getProvider() {
            if (provider != null && !provider.isBlank()) return provider;
            if (easyPay != null && easyPay.getProvider() != null) {
                return easyPay.getProvider();
            }
            return type;
        }
    }

    @Getter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class EasyPay {
        private String provider;
    }

    public int getAmount() {
        return amount != null ? amount.getTotal() : 0;
    }

    public Long getCancelledAmount() { return amount == null ? null : amount.getCancelled(); }

    public String getPayMethod() {
        return method != null ? method.getType() : null;
    }

    public String getPgProvider() {
        return method != null ? method.getProvider() : null;
    }

    public boolean isPaid() {
        return "PAID".equals(status);
    }
}
