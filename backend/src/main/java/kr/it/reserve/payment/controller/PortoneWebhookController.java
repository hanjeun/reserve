package kr.it.reserve.payment.controller;

import kr.it.reserve.payment.service.PaymentWebhookInboxProcessor;
import kr.it.reserve.payment.service.PortoneWebhookVerifier;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 서명 검증 전에는 원문을 파싱하지 않는다. 서명 대상 원문을 보존하므로 DTO로 재직렬화하지 않는다.
 * 처리 실패를 성공 응답으로 숨기지 않아 제공자가 재전송할 수 있게 한다.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/payment")
public class PortoneWebhookController {

    private final PortoneWebhookVerifier verifier;
    private final PaymentWebhookInboxProcessor inboxProcessor;

    @PostMapping("/webhook/portone")
    public ResponseEntity<Void> receive(
            @RequestHeader(value = "webhook-id", required = false) String webhookId,
            @RequestHeader(value = "webhook-timestamp", required = false) String webhookTimestamp,
            @RequestHeader(value = "webhook-signature", required = false) String webhookSignature,
            @RequestBody(required = false) String rawBody) {

        if (!verifier.isValid(webhookId, webhookTimestamp, webhookSignature, rawBody)) {
            // 본문은 로그에 남기지 않는다 — 위조 시도가 로그를 채우고, 정상 건에는 결제 정보가 들어 있다.
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }

        try {
            // 서명 검증 뒤에는 반드시 durable inbox를 거친다. 처리 중 서버가 죽어도
            // 저장된 결제 ID로 다시 PG 권위 상태를 조회할 수 있다.
            inboxProcessor.receive(webhookId, rawBody);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            // 5xx 를 돌려주어 PortOne 의 재전송을 유도한다(클래스 주석 참고).
            log.error("PortOne webhook processing failed: webhookId={}, errorType={}",
                    webhookId, e.getClass().getSimpleName());
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
