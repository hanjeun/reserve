package kr.it.reserve.payment.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.*;

/**
 * 포트원 결제 조회 응답 DTO
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class PortonePaymentResponse {
    
    private int code;
    private String message;
    private Response response;

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class Response {
        
        @JsonProperty("imp_uid")
        private String impUid;
        
        @JsonProperty("merchant_uid")
        private String merchantUid;
        
        @JsonProperty("pay_method")
        private String payMethod;
        
        private String channel;
        
        @JsonProperty("pg_provider")
        private String pgProvider;
        
        @JsonProperty("emb_pg_provider")
        private String embPgProvider;
        
        @JsonProperty("pg_tid")
        private String pgTid;
        
        @JsonProperty("pg_id")
        private String pgId;
        
        private boolean escrow;
        
        @JsonProperty("apply_num")
        private String applyNum;
        
        @JsonProperty("bank_code")
        private String bankCode;
        
        @JsonProperty("bank_name")
        private String bankName;
        
        @JsonProperty("card_code")
        private String cardCode;
        
        @JsonProperty("card_name")
        private String cardName;
        
        @JsonProperty("card_number")
        private String cardNumber;
        
        @JsonProperty("card_quota")
        private int cardQuota;
        
        @JsonProperty("card_type")
        private String cardType;
        
        @JsonProperty("vbank_code")
        private String vbankCode;
        
        @JsonProperty("vbank_name")
        private String vbankName;
        
        @JsonProperty("vbank_num")
        private String vbankNum;
        
        @JsonProperty("vbank_holder")
        private String vbankHolder;
        
        @JsonProperty("vbank_date")
        private long vbankDate;
        
        @JsonProperty("vbank_issued_at")
        private long vbankIssuedAt;
        
        private String name;
        
        private int amount;
        
        @JsonProperty("cancel_amount")
        private int cancelAmount;
        
        private String currency;
        
        @JsonProperty("buyer_name")
        private String buyerName;
        
        @JsonProperty("buyer_email")
        private String buyerEmail;
        
        @JsonProperty("buyer_tel")
        private String buyerTel;
        
        @JsonProperty("buyer_addr")
        private String buyerAddr;
        
        @JsonProperty("buyer_postcode")
        private String buyerPostcode;
        
        @JsonProperty("custom_data")
        private String customData;
        
        @JsonProperty("user_agent")
        private String userAgent;
        
        private String status;
        
        @JsonProperty("started_at")
        private long startedAt;
        
        @JsonProperty("paid_at")
        private long paidAt;
        
        @JsonProperty("failed_at")
        private long failedAt;
        
        @JsonProperty("cancelled_at")
        private long cancelledAt;
        
        @JsonProperty("fail_reason")
        private String failReason;
        
        @JsonProperty("cancel_reason")
        private String cancelReason;
        
        @JsonProperty("receipt_url")
        private String receiptUrl;
    }
}
