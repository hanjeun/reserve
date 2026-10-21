package kr.it.reserve.config.oauth2.events;

import kr.it.reserve.member.entity.AuthProvider;

import java.time.Instant;
import java.util.List;

/** 검증 후 메모리에서만 사용하는 최소 정보. SET 원문과 개인정보는 inbox에 저장하지 않는다. */
public record VerifiedOAuthSecurityEvent(
        AuthProvider provider, String eventId, Instant occurredAt, List<Action> actions, String verificationStateHash) {
    public VerifiedOAuthSecurityEvent {
        actions = List.copyOf(actions);
    }

    public VerifiedOAuthSecurityEvent(AuthProvider provider, String eventId, Instant occurredAt, List<Action> actions) {
        this(provider, eventId, occurredAt, actions, null);
    }

    public record Action(String providerId, boolean clearProviderToken) { }
}
