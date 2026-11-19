package kr.it.reserve.config.updates;

import jakarta.servlet.http.HttpServletRequest;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.common.SseResponses;
import kr.it.reserve.global.ratelimit.IpExtractor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/updates")
@RequiredArgsConstructor
public class EntityUpdateController {
    private final EntityUpdateStream streams;

    @GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> events() {
        return SseResponses.open(() -> streams.subscribe(SecurityUtil.getCurrentMember("로그인이 필요해요."),
                SecurityUtil.getOAuthAuthenticationAt(), SecurityUtil.getLoginMethod(), SecurityUtil.getSessionId()));
    }

    @GetMapping(value = "/public/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> publicEvents(HttpServletRequest request) {
        return SseResponses.open(() -> streams.subscribePublic(IpExtractor.extract(request)));
    }
}
