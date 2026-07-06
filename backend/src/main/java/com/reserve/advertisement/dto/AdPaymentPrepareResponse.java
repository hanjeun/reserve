package com.reserve.advertisement.dto;

import lombok.Builder;
import lombok.Getter;

/** 광고 결제 준비 응답 — 프론트 IMP.request_pay에 필요한 값들 (예약금 결제와 동일한 패턴) */
@Getter
@Builder
public class AdPaymentPrepareResponse {
    private Long adId;
    private String merchantUid;
    private Integer amount;
    private String productName;
    private String buyerName;
    private String buyerEmail;
    private String buyerTel;
    private String impCode;
}
