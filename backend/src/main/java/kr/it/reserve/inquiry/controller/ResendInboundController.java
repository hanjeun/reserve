package kr.it.reserve.inquiry.controller;

import jakarta.servlet.http.HttpServletRequest;
import kr.it.reserve.config.ApiPaths;
import kr.it.reserve.global.ratelimit.IpExtractor;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.inquiry.service.ResendInboundService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;

@RestController
@ConditionalOnProperty(name = "mail.resend-inbound.enabled", havingValue = "true")
public class ResendInboundController {
    private static final int MAX_PAYLOAD_BYTES = 256 * 1024;
    private final ResendWebhookSignature signature;
    private final ResendInboundService inbound;
    private final RateLimiter limiter;

    public ResendInboundController(ResendInboundService inbound, RateLimiter limiter,
            @Value("${mail.resend-inbound.signing-secret}") String signingSecret) {
        this.inbound = inbound;
        this.limiter = limiter;
        this.signature = new ResendWebhookSignature(signingSecret);
    }

    @PostMapping(value = ApiPaths.RESEND_INBOUND, consumes = MediaType.APPLICATION_JSON_VALUE)
    public ResponseEntity<Void> receive(HttpServletRequest request) throws IOException {
        if (!limiter.tryConsume(IpExtractor.extract(request), RateLimiter.Policy.RESEND_WEBHOOK_IP)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).header("Retry-After", "60").build();
        }
        if (request.getContentLengthLong() > MAX_PAYLOAD_BYTES) return payloadTooLarge();
        byte[] body = request.getInputStream().readNBytes(MAX_PAYLOAD_BYTES + 1);
        if (body.length > MAX_PAYLOAD_BYTES) return payloadTooLarge();
        if (!signature.matches(request.getHeader("svix-id"), request.getHeader("svix-timestamp"),
                request.getHeader("svix-signature"), body)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        }
        inbound.receive(body);
        return ResponseEntity.ok().build();
    }

    private static ResponseEntity<Void> payloadTooLarge() {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).build();
    }
}
