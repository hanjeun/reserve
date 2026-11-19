package kr.it.reserve.config.oauth2;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.web.util.WebUtils;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

public final class OAuthLoginOutcome {
    private static final String SESSION_KEY = OAuthLoginOutcome.class.getName();
    private static final long TTL_SECONDS = 180;

    private OAuthLoginOutcome() {
    }

    public record View(String code, String status, String until) implements Serializable {
        public View(String code) {
            this(code, null, null);
        }
    }

    private record Pending(String reference, Instant expiresAt, View view) implements Serializable { }

    /** 주소에는 브라우저 세션에서 한 번만 사용할 수 있는 참조만 전달한다. */
    public static String redirect(HttpServletRequest request, String origin, View view) {
        String reference = UUID.randomUUID().toString();
        var session = request.getSession();
        synchronized (WebUtils.getSessionMutex(session)) {
            session.setAttribute(SESSION_KEY, new Pending(reference, Instant.now().plusSeconds(TTL_SECONDS), view));
        }
        return origin + "/login?error=oauth2&result=" + reference;
    }

    public static View take(HttpServletRequest request, String reference) {
        if (reference == null || reference.length() != 36) return null;
        var session = request.getSession(false);
        if (session == null) return null;
        try {
            synchronized (WebUtils.getSessionMutex(session)) {
                if (!(session.getAttribute(SESSION_KEY) instanceof Pending pending)
                        || !pending.reference().equals(reference)) return null;
                session.removeAttribute(SESSION_KEY);
                return Instant.now().isBefore(pending.expiresAt()) ? pending.view() : null;
            }
        } catch (IllegalStateException invalidated) {
            return null;
        }
    }
}
