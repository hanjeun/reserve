package kr.it.reserve.payment.controller;

import kr.it.reserve.payment.service.PortoneWebhookService;
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
 * PortOne 웹훅 수신 — 2026-08-23 신설.
 *
 * <h2>이 엔드포인트의 인증은 서명 하나뿐이다</h2>
 * PortOne 서버가 호출하므로 로그인 세션이 없다({@code SecurityConfig} 에서 permitAll).
 * 따라서 <b>서명 검증을 통과하지 못한 요청은 본문을 파싱조차 하지 않는다.</b>
 *
 * <h2>본문을 {@code String} 으로 받는 이유</h2>
 * 서명은 <b>원본 바이트</b>에 대해 계산된다. DTO 로 바인딩했다가 다시 직렬화하면
 * 공백·키 순서가 달라져 <b>정상 요청도 전부 위조로 판정된다.</b> 절대 DTO 로 바꾸지 말 것.
 *
 * <h2>응답 코드가 곧 재전송 정책이다</h2>
 * <ul>
 *   <li><b>2xx</b> — 처리 완료. PortOne 은 다시 보내지 않는다.</li>
 *   <li><b>4xx</b> — 서명 실패. 다시 보내도 결과가 같으므로 재전송을 원치 않는다.</li>
 *   <li><b>5xx</b> — 우리 쪽 일시 장애. <b>재전송을 받고 싶을 때만</b> 낸다.</li>
 * </ul>
 * 처리 중 예외를 무조건 삼켜 200 을 주면, 일시 장애로 놓친 이벤트를 <b>영영 다시 받지 못한다.</b>
 */
@Slf4j
@RestController
@RequiredArgsConstructor
@RequestMapping("/api/payment")
public class PortoneWebhookController {

    private final PortoneWebhookVerifier verifier;
    private final PortoneWebhookService webhookService;

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
            webhookService.handle(rawBody);
            return ResponseEntity.ok().build();
        } catch (Exception e) {
            // 5xx 를 돌려주어 PortOne 의 재전송을 유도한다(클래스 주석 참고).
            log.error("PortOne webhook processing failed: webhookId={}", webhookId, e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).build();
        }
    }
}
