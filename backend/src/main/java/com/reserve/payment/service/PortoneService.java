package com.reserve.payment.service;

import com.reserve.global.error.PaymentException;
import com.reserve.payment.dto.PortoneV2PaymentResponse;
import lombok.Getter;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.HttpServerErrorException;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class PortoneService {

    private final RestTemplate restTemplate;

    // V1: 프론트엔드 IMP.init()용 고객사 식별코드
    @Getter
    @Value("${portone.imp-code}")
    private String impCode;

    // V2: REST API 인증 시크릿 (토큰 교환 불필요)
    @Value("${portone.v2-secret}")
    private String v2Secret;

    // V2: 상점 ID
    @Value("${portone.store-id}")
    private String storeId;

    private static final String V2_API_URL = "https://api.portone.io";

    /**
     * 주문번호(merchantUid)로 V2 결제 정보 조회
     * V2 API에서 paymentId = merchant_uid
     */
    public PortoneV2PaymentResponse getPaymentInfo(String merchantUid) {
        String url = V2_API_URL + "/payments/" + merchantUid;
        try {
            ResponseEntity<PortoneV2PaymentResponse> response =
                    restTemplate.exchange(url, HttpMethod.GET, createV2Headers(), PortoneV2PaymentResponse.class);

            if (response.getBody() == null) {
                throw new PaymentException("포트원 결제 정보를 찾을 수 없습니다.", HttpStatus.NOT_FOUND);
            }

            log.info("Portone V2 payment retrieved: paymentId={}, status={}", merchantUid, response.getBody().getStatus());
            return response.getBody();

        } catch (PaymentException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            log.error("Portone V2 payment retrieval failed: paymentId={}, status={}, body={}",
                    merchantUid, e.getStatusCode(), e.getResponseBodyAsString());
            if (e.getStatusCode() == HttpStatus.NOT_FOUND) {
                throw new PaymentException("결제 정보 조회 실패 (404 NOT_FOUND)", HttpStatus.NOT_FOUND);
            }
            throw new PaymentException("결제 정보 조회 실패 (" + e.getStatusCode() + ")", HttpStatus.INTERNAL_SERVER_ERROR);
        } catch (HttpServerErrorException e) {
            log.error("Portone V2 server error: paymentId={}, status={}, body={}",
                    merchantUid, e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException("포트원 서버 오류 (" + e.getStatusCode() + ")", HttpStatus.INTERNAL_SERVER_ERROR);
        } catch (Exception e) {
            log.error("Portone V2 payment retrieval network error: paymentId={}, error={}", merchantUid, e.getMessage(), e);
            throw new PaymentException("결제 정보 조회 중 통신 오류가 발생했습니다.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /**
     * V2 결제 취소 (환불)
     * POST /payments/{paymentId}/cancel
     */
    public void cancelPayment(String merchantUid, Integer amount, String reason) {
        String url = V2_API_URL + "/payments/" + merchantUid + "/cancel";

        Map<String, Object> body = new HashMap<>();
        body.put("storeId", storeId);
        body.put("reason", reason != null ? reason : "환불 요청");
        if (amount != null) {
            body.put("amount", amount);  // null이면 전액 환불
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "PortOne " + v2Secret);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

            restTemplate.postForEntity(url, entity, Void.class);
            log.info("Portone V2 payment cancelled: paymentId={}, amount={}", merchantUid, amount);

        } catch (PaymentException e) {
            throw e;
        } catch (HttpClientErrorException | HttpServerErrorException e) {
            log.error("Portone V2 payment cancellation failed: paymentId={}, status={}, body={}",
                    merchantUid, e.getStatusCode(), e.getResponseBodyAsString());
            throw new PaymentException("환불 처리 실패 (" + e.getStatusCode() + ")", HttpStatus.INTERNAL_SERVER_ERROR);
        } catch (Exception e) {
            log.error("Portone V2 payment cancellation network error: paymentId={}, error={}", merchantUid, e.getMessage(), e);
            throw new PaymentException("환불 처리 중 통신 오류가 발생했습니다.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    private HttpEntity<Void> createV2Headers() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "PortOne " + v2Secret);
        return new HttpEntity<>(headers);
    }
}
