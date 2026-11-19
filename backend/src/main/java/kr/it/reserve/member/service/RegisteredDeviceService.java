package kr.it.reserve.member.service;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.updates.EntityUpdates;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.security.ip.IpLoginProtection;
import kr.it.reserve.global.security.ip.IpLoginProtection.RegisteredBrowser;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.mfa.MfaCrypto;
import kr.it.reserve.member.mfa.MfaService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class RegisteredDeviceService {
    private final MfaService mfa;
    private final IpLoginProtection protection;
    private final RefreshTokenRepository sessions;
    private final TokenProvider tokens;
    private final EntityUpdates updates;

    public record Device(String id, String os, String browser, Instant expiresAt, boolean current, SessionState sessionState,
                         boolean registered, Instant signedInAt) { }
    public enum SessionState { ACTIVE, SIGNED_OUT, UNKNOWN }

    @Transactional
    public List<Device> list(Member authenticated, String sessionId) {
        Member member = mfa.requireDeviceManagement(authenticated);
        List<RegisteredBrowser> registered = registeredBrowsers(member, sessionId);
        List<RefreshToken> active = activeSessions(member);
        Map<String, String> activeReferences = new HashMap<>();
        if (!registered.isEmpty()) active.forEach(session ->
                activeReferences.put(protection.sessionReference(member, session.getSessionId()), session.getSessionId()));
        Set<String> linked = registered.stream().flatMap(device -> device.sessionReferences().stream())
                .map(activeReferences::get).filter(Objects::nonNull).collect(Collectors.toSet());
        boolean currentRegistered = registered.stream().anyMatch(RegisteredBrowser::current);
        List<RefreshToken> separate = active.stream()
                .filter(session -> !linked.contains(session.getSessionId())
                        && !(currentRegistered && sessionId.equals(session.getSessionId())))
                .toList();
        boolean unlinked = separate.stream().anyMatch(session -> !sessionId.equals(session.getSessionId()));
        List<Device> result = new ArrayList<>();
        registered.stream().sorted(Comparator.comparing(RegisteredBrowser::expiresAt).reversed())
                .map(device -> new Device(device.id(), device.os(), device.browser(), device.expiresAt(), device.current(),
                        state(device, activeReferences.keySet(), unlinked), true, null))
                .forEach(result::add);
        separate.stream().sorted(Comparator.comparing(RefreshToken::getCreatedAt).reversed())
                .map(session -> new Device(sessionDisplayId(member, session), null, null, null,
                        sessionId.equals(session.getSessionId()), SessionState.ACTIVE, false,
                        session.getCreatedAt().toInstant(ZoneOffset.UTC)))
                .forEach(result::add);
        result.sort(Comparator.comparing(Device::current).reversed());
        return result;
    }

    @Transactional
    public void register(Member authenticated, String sessionId, String ticket) {
        requireRegistration();
        Member member = mfa.requireDeviceManagement(authenticated);
        protection.registerCurrentBrowser(member, sessionId, ticket);
    }

    @Transactional
    public void forget(Member authenticated, String deviceId) {
        requireRegistration();
        Member member = mfa.requireDeviceManagement(authenticated);
        protection.forgetRegisteredBrowser(member, deviceId);
    }

    @Transactional
    public void signOut(Member authenticated, String sessionId, String deviceId) {
        Member member = mfa.requireDeviceManagement(authenticated);
        RegisteredBrowser device = registeredBrowsers(member, sessionId).stream()
                .filter(browser -> browser.id().equals(deviceId))
                .findFirst().orElse(null);
        if (device != null) {
            if (device.current()) throw currentDevice();
            if (device.sessionReferences().isEmpty())
                throw AuthException.badRequest("이 기기의 로그인 세션을 확인할 수 없어요.");
        }
        List<RefreshToken> targets = activeSessions(member).stream()
                .filter(session -> device == null ? sessionDisplayId(member, session).equals(deviceId)
                        : device.sessionReferences().contains(protection.sessionReference(member, session.getSessionId())))
                .filter(session -> {
                    if (!sessionId.equals(session.getSessionId())) return true;
                    if (device == null) throw currentDevice();
                    return false;
                }).toList();
        if (device == null && targets.isEmpty()) throw new AuthException("로그인 기기를 찾지 못했어요.", HttpStatus.NOT_FOUND);
        targets.forEach(sessions::delete);
        if (!targets.isEmpty()) updates.recheckSessions(member.getId());
    }

    private List<RefreshToken> activeSessions(Member member) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        return sessions.findByMemberIdForUpdate(member.getId()).stream()
                .filter(session -> session.getAuthVersion() == member.getAuthVersion()
                        && tokens.isSessionLive(member, session, now)
                        && tokens.isLoginSessionCurrent(member, session.getOauthAuthenticatedAt(), session.getLoginMethod()))
                .toList();
    }

    private List<RegisteredBrowser> registeredBrowsers(Member member, String sessionId) {
        return protection.enabled() ? protection.registeredBrowsers(member, sessionId) : List.of();
    }

    private void requireRegistration() {
        if (!protection.enabled()) throw AuthException.badRequest("이 환경에서는 기기 등록을 사용할 수 없어요.");
    }

    private static String sessionDisplayId(Member member, RefreshToken session) {
        return MfaCrypto.digest("login-device:" + member.getId() + ":" + member.getAuthVersion() + ":" + session.getSessionId());
    }

    private static AuthException currentDevice() {
        return AuthException.badRequest("지금 사용하는 기기는 프로필 메뉴에서 로그아웃해주세요.");
    }

    private static SessionState state(RegisteredBrowser device, Set<String> active, boolean unlinked) {
        if (device.current() || device.sessionReferences().stream().anyMatch(active::contains)) return SessionState.ACTIVE;
        return device.sessionReferences().isEmpty() || unlinked ? SessionState.UNKNOWN : SessionState.SIGNED_OUT;
    }
}
