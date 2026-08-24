package kr.it.reserve.payment.service;

import jakarta.annotation.PostConstruct;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
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

    // V2: REST API 인증 시크릿 (토큰 교환 불필요)
    @Value("${portone.v2-secret}")
    private String v2Secret;

    // V2: 상점 ID.
    // 프론트엔드 PortOne.requestPayment()의 storeId 로도 내려간다 — V1 의 impCode 자리를 대체한다.
    @Getter
    @Value("${portone.store-id}")
    private String storeId;

    private static final String V2_API_URL = "https://api.portone.io";

    /**
     * 기동 시 PortOne 설정을 한 번 점검한다.
     *
     * <p>예전에는 storeId 가 취소 요청에서만 쓰여서, 값이 잘못돼 있어도 결제·조회는 멀쩡히 돌아가고
     * <b>환불을 실제로 시도하는 순간에야</b> 404 로 드러났다(2026-08-09에 그렇게 터졌다).
     * V2 전환 이후로는 storeId 가 <b>결제창을 여는 데에도</b> 필요하므로 비어 있으면 결제 자체가 시작되지 않는다.
     * 그래서 경고가 아니라 에러로 남긴다.
     */
    @PostConstruct
    void checkPortoneConfig() {
        if (v2Secret == null || v2Secret.isBlank()) {
            log.error("PORTONE_V2_SECRET is empty - every PortOne V2 call will fail");
        }
        if (storeId == null || storeId.isBlank()) {
            log.error("PORTONE_STORE_ID is empty - the payment window cannot be opened and cancellations will fail");
        } else {
            log.info("PortOne V2 config loaded: storeId={}", storeId);
        }
    }

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
     * V2 결제 취소 (환불).
     * {@code POST /payments/{paymentId}/cancel}
     *
     * <p>★ 2026-08-23 — <b>반환 타입이 {@code void} 에서 바뀌었다.</b> 예전에는 응답 본문을
     * {@code Void.class} 로 받아 통째로 버렸고, 그래서 HTTP 200 만 오면 호출측이 무조건
     * "환불 완료"로 기록했다. 그런데 PortOne V2 의 취소는 <b>200 을 주면서
     * {@code status: "REQUESTED"}(접수만 됨)를 돌려줄 수 있다.</b> 그 뒤 PG 에서 실패하면
     * 우리 DB 는 REFUNDED 인데 손님 돈은 그대로인 상태가 된다.
     * 이제 결과를 그대로 돌려주고, <b>무엇으로 기록할지는 호출측이 정한다.</b>
     *
     * @return 취소 결과. 예외를 던지지 않았다면 최소한 PG 가 요청을 받긴 한 것이다.
     */
    public PortoneV2CancelResponse cancelPayment(String merchantUid, Integer amount, String reason) {
        String url = V2_API_URL + "/payments/" + merchantUid + "/cancel";

        Map<String, Object> body = new HashMap<>();
        // ★ storeId 는 값이 있을 때만 싣는다 (2026-08-09 운영 장애).
        //   PortOne V2 는 본문에 storeId 가 오면 "그 상점 범위에서" 결제를 찾는다.
        //   값이 비었거나 결제가 속한 상점과 다르면 결제가 존재해도 404 PAYMENT_NOT_FOUND 다.
        //   조회(getPaymentInfo)는 storeId 를 아예 안 보내 시크릿의 기본 상점으로 해석되는데
        //   취소만 보내고 있어서 "같은 결제인데 조회는 200 PAID, 취소만 404" 가 났다.
        //   PORTONE_STORE_ID 가 비면 조회와 같은 해석 경로를 타도록 키 자체를 넣지 않는다.
        if (storeId != null && !storeId.isBlank()) {
            body.put("storeId", storeId);
        }
        body.put("reason", reason != null ? reason : "환불 요청");
        if (amount != null) {
            body.put("amount", amount);  // null이면 전액 환불
        }

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "PortOne " + v2Secret);
            headers.setContentType(MediaType.APPLICATION_JSON);
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

            ResponseEntity<PortoneV2CancelResponse> response =
                    restTemplate.postForEntity(url, entity, PortoneV2CancelResponse.class);

            PortoneV2CancelResponse result = response.getBody();
            if (result == null) {
                // 200 인데 본문이 없다. 성공으로 낙관하지 않는다 — UNKNOWN 을 돌려주면
                // 호출측이 원장에 미결로 남기고 사람이 확인하게 된다.
                log.error("Portone V2 cancel returned an empty body: paymentId={}, amount={}", merchantUid, amount);
                return new PortoneV2CancelResponse();
            }

            log.info("Portone V2 cancel responded: paymentId={}, amount={}, status={}, cancellationId={}",
                    merchantUid, amount, result.resolveStatus(), result.cancellationId());
            return result;

        } catch (PaymentException e) {
            throw e;
        } catch (HttpClientErrorException | HttpServerErrorException e) {
            // storeIdSent 를 같이 남긴다 — 위 404 원인 분석에 필요한 유일한 변수다.
            log.error("Portone V2 payment cancellation failed: paymentId={}, storeIdSent={}, amount={}, status={}, body={}",
                    merchantUid, body.containsKey("storeId"), amount, e.getStatusCode(), e.getResponseBodyAsString());
            // 사용자에게는 PG 상태코드를 노출하지 않는다. 원인은 로그·Sentry 에만 남긴다.
            throw new PaymentException("환불 처리에 실패했습니다. 잠시 후 다시 시도해주세요.", HttpStatus.INTERNAL_SERVER_ERROR);
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
