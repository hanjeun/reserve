package kr.it.reserve.payment.dto;

public record PaymentReceiptResponse(String type, String merchantUid, String receiptUrl, String payMethod, String payProvider) {}
