package kr.it.reserve.payment.service;

import jakarta.annotation.PostConstruct;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.web.util.UriComponentsBuilder;

import java.util.Objects;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class PortoneService {

    private final RestTemplate restTemplate;
    private java.util.concurrent.Semaphore operations = new java.util.concurrent.Semaphore(4);
    @Value("${portone.max-concurrent-requests:4}") private int maxConcurrentRequests = 4;
    @org.springframework.beans.factory.annotation.Autowired(required = false) private io.micrometer.core.instrument.MeterRegistry metrics;

    // V2: REST API 인증 시크릿 (토큰 교환 불필요)
    @Value("${portone.v2-secret}")
    private String v2Secret;

    // V2: 상점 ID.
    // 프론트엔드 PortOne.requestPayment()의 storeId 로도 내려간다 — V1 의 impCode 자리를 대체한다.
    @Getter
    @Value("${portone.store-id}")
    private String storeId;

    private static final String V2_API_URL = "https://api.portone.io";
    private static final ObjectMapper ERROR_JSON = new ObjectMapper();

    /** 결제·취소에 필요한 PortOne 설정은 기동 시 확인한다. */
    @PostConstruct
    void checkPortoneConfig() {
        if (maxConcurrentRequests < 1 || maxConcurrentRequests > 16) throw new IllegalArgumentException("Invalid PortOne concurrency limit");
        operations = new java.util.concurrent.Semaphore(maxConcurrentRequests);
        if (metrics != null) {
            io.micrometer.core.instrument.Gauge.builder("reserve.payment.pg.inflight", this, value -> value.maxConcurrentRequests - value.operations.availablePermits()).register(metrics);
            io.micrometer.core.instrument.Gauge.builder("reserve.payment.pg.limit", this, value -> value.maxConcurrentRequests).register(metrics);
        }
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
        if (merchantUid == null || merchantUid.isBlank() || merchantUid.length() > 255) {
            throw new PaymentException("주문번호를 확인해주세요.", HttpStatus.BAD_REQUEST);
        }
        if (storeId == null || storeId.isBlank() || v2Secret == null || v2Secret.isBlank()) {
            throw new PaymentException("결제 연결을 확인할 수 없어요.", HttpStatus.SERVICE_UNAVAILABLE);
        }
        var url = UriComponentsBuilder.fromUriString(V2_API_URL).pathSegment("payments", merchantUid)
                .queryParam("storeId", storeId).build().encode().toUri();
        try {
            ResponseEntity<PortoneV2PaymentResponse> response =
                    limited(() -> restTemplate.exchange(url, HttpMethod.GET, createV2Headers(), PortoneV2PaymentResponse.class));

            if (response.getBody() == null) {
                throw new PaymentException("결제 상태를 확인하지 못했어요. 잠시 후 다시 확인해주세요.", HttpStatus.BAD_GATEWAY);
            }

            // 다른 주문·상점·통화의 응답은 승인·환불 대사에 전달하지 않는다.
            var payment = response.getBody();
            if (!Objects.equals(merchantUid, payment.getPaymentId()) || !Objects.equals(storeId, payment.getStoreId())
                    || !"KRW".equals(payment.getCurrency())) {
                log.error("Portone V2 payment identity mismatch: paymentId={}", merchantUid);
                throw new PaymentException("결제 정보가 일치하지 않아 확인을 보류했어요.", HttpStatus.CONFLICT);
            }
            log.info("Portone V2 payment retrieved: paymentId={}, status={}", merchantUid, payment.getStatus());
            return response.getBody();

        } catch (PaymentException e) {
            throw e;
        } catch (HttpClientErrorException e) {
            log.error("Portone V2 payment retrieval failed: paymentId={}, status={}",
                    merchantUid, e.getStatusCode());
            if (e.getStatusCode() == HttpStatus.NOT_FOUND && isMissingPayment(e)) {
                throw new PaymentException("결제 정보 조회 실패 (404 NOT_FOUND)", HttpStatus.NOT_FOUND);
            }
            throw new PaymentException("결제 정보 조회 실패 (" + e.getStatusCode() + ")", HttpStatus.INTERNAL_SERVER_ERROR);
        } catch (HttpServerErrorException e) {
            log.error("Portone V2 server error: paymentId={}, status={}",
                    merchantUid, e.getStatusCode());
            throw new PaymentException("포트원 서버 오류 (" + e.getStatusCode() + ")", HttpStatus.INTERNAL_SERVER_ERROR);
        } catch (Exception e) {
            log.error("Portone V2 payment retrieval network error: paymentId={}, errorType={}",
                    merchantUid, e.getClass().getSimpleName());
            throw new PaymentException("결제 정보 조회 중 통신 오류가 발생했어요.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /** 프록시·설정 오류의 일반 404를 미결제 증거로 사용하지 않아요. */
    private boolean isMissingPayment(HttpClientErrorException error) {
        try {
            String body = error.getResponseBodyAsString();
            return body.length() <= 8192 && "PAYMENT_NOT_FOUND".equals(ERROR_JSON.readTree(body).path("type").asText());
        } catch (Exception ignored) {
            return false;
        }
    }

    /**
     * HTTP 성공은 환불 완료를 뜻하지 않는다. PG 취소 상태와 금액은 호출부가 확인한다.
     * @return PG의 취소 접수·처리 결과
     */
    public PortoneV2CancelResponse cancelPayment(String merchantUid, Integer amount, String reason) {
        return cancelPayment(merchantUid, amount, reason, null);
    }

    /** 광고 전액 환불은 저장한 키와 예상 잔액을 보내 중복/외부 취소 경합을 방어한다. */
    public PortoneV2CancelResponse cancelPayment(String merchantUid, Integer amount, String reason, String idempotencyKey) {
        return cancelPayment(merchantUid, amount, reason, idempotencyKey, idempotencyKey == null ? null : amount);
    }

    /** 부분 환불 요청액과 PG의 현재 취소 가능 잔액은 서로 다른 값이다. */
    public PortoneV2CancelResponse cancelPayment(String merchantUid, Integer amount, String reason,
                                                String idempotencyKey, Integer currentCancellableAmount) {
        if (storeId == null || storeId.isBlank() || v2Secret == null || v2Secret.isBlank()) {
            throw new RequestNotSentException("결제 연결 설정을 확인한 뒤 환불을 다시 시도해주세요.");
        }
        if (merchantUid == null || merchantUid.isBlank() || merchantUid.length() > 255
                || amount != null && amount <= 0 || reason != null && reason.length() > 500) {
            throw new IllegalArgumentException("Invalid cancellation command");
        }
        if (idempotencyKey != null && (!idempotencyKey.matches("[A-Za-z0-9_-]{16,256}") || amount == null || amount <= 0)) {
            throw new IllegalArgumentException("Invalid cancellation command");
        }
        if (currentCancellableAmount != null && (amount == null || currentCancellableAmount < amount)) {
            throw new IllegalArgumentException("Invalid cancellable balance");
        }
        var url = UriComponentsBuilder.fromUriString(V2_API_URL).pathSegment("payments", merchantUid, "cancel")
                .build().encode().toUri();

        Map<String, Object> body = new HashMap<>();
        body.put("storeId", storeId);
        body.put("reason", reason != null ? reason : "환불 요청");
        if (amount != null) {
            body.put("amount", amount);  // null이면 전액 환불
        }
        if (currentCancellableAmount != null) body.put("currentCancellableAmount", currentCancellableAmount);

        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("Authorization", "PortOne " + v2Secret);
            headers.setContentType(MediaType.APPLICATION_JSON);
            if (idempotencyKey != null) headers.set("Idempotency-Key", "\"" + idempotencyKey + "\"");
            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);

            ResponseEntity<PortoneV2CancelResponse> response =
                    limited(() -> restTemplate.postForEntity(url, entity, PortoneV2CancelResponse.class));

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
            log.error("Portone V2 payment cancellation failed: paymentId={}, storeIdSent={}, amount={}, status={}",
                    merchantUid, body.containsKey("storeId"), amount, e.getStatusCode());
            // 사용자에게는 PG 상태코드를 노출하지 않는다. 원인은 로그·Sentry 에만 남긴다.
            throw new PaymentException("환불 처리에 실패했어요. 잠시 후 다시 시도해주세요.", HttpStatus.INTERNAL_SERVER_ERROR);
        } catch (Exception e) {
            log.error("Portone V2 payment cancellation network error: paymentId={}, errorType={}",
                    merchantUid, e.getClass().getSimpleName());
            throw new PaymentException("환불 처리 중 통신 오류가 발생했어요.", HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }

    /** 외부 통신 전에 로컬 상한으로 거절한 요청만 구분한다. */
    public static final class RequestNotSentException extends PaymentException {
        public RequestNotSentException() {
            this("결제 확인 요청이 많아요. 잠시 후 내역을 확인해주세요.");
        }
        private RequestNotSentException(String message) {
            super(message, HttpStatus.SERVICE_UNAVAILABLE);
        }
    }

    /** 외부 지연이 요청 스레드를 모두 점유하지 않도록 대기열 없이 제한한다. */
    private <T> T limited(java.util.function.Supplier<T> call) {
        if (!operations.tryAcquire()) {
            if (metrics != null) metrics.counter("reserve.payment.pg.rejected").increment();
            throw new RequestNotSentException();
        }
        try { return call.get(); }
        finally { operations.release(); }
    }

    private HttpEntity<Void> createV2Headers() {
        HttpHeaders headers = new HttpHeaders();
        headers.set("Authorization", "PortOne " + v2Secret);
        return new HttpEntity<>(headers);
    }
}
