package kr.it.reserve.config.updates;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import kr.it.reserve.config.util.SecurityUtil;
import kr.it.reserve.global.ratelimit.IpExtractor;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
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
    public SseEmitter events(HttpServletResponse response) {
        headers(response);
        return streams.subscribe(SecurityUtil.getCurrentMember("로그인이 필요해요."), SecurityUtil.getOAuthAuthenticationAt());
    }

    @GetMapping(value = "/public/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter publicEvents(HttpServletRequest request, HttpServletResponse response) {
        headers(response);
        return streams.subscribePublic(IpExtractor.extract(request));
    }

    private void headers(HttpServletResponse response) {
        response.setHeader("Cache-Control", "no-store");
        response.setHeader("X-Accel-Buffering", "no");
    }
}
