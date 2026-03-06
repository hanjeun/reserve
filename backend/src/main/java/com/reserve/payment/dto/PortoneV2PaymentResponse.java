package com.reserve.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
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
    private String paymentId;

    // V2 status: READY, PAID, FAILED, CANCELLED, PARTIAL_CANCELLED
    private String status;

    // 결제 금액 정보
    private Amount amount;

    // 결제 수단 정보
    private Method method;

    // PG사 거래번호 (V1의 imp_uid에 해당)
    private String pgTxId;

    @Getter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Amount {
        private int total;
    }

    @Getter
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Method {
        // "EasyPay", "Card", "Transfer" 등
        private String type;

        // EasyPay 제공사: "KakaoPay", "NaverPay" 등
        @JsonProperty("easyPay")
        private EasyPay easyPay;

        public String getProvider() {
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
