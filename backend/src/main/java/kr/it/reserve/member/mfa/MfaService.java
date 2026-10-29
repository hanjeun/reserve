package kr.it.reserve.member.mfa;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
@RequiredArgsConstructor
public class MfaService {
    private final MemberRepository members;
    private final MfaAccountRepository accounts;
    private final MfaCredentialRepository credentials;
    private final MfaChallengeRepository challenges;
    private final MfaRecoveryCodeRepository recovery;
    private final RefreshTokenRepository sessions;
    private final MfaProperties properties;
    private final MfaPolicy policy;
    private final MfaCrypto crypto;
    private final MfaPasskeys passkeys;
    private final TokenProvider tokens;
    private final kr.it.reserve.global.ratelimit.RateLimiter limiter;
    private final org.springframework.context.ApplicationEventPublisher events;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager entityManager;
    @org.springframework.beans.factory.annotation.Autowired @org.springframework.context.annotation.Lazy private PasswordEncoder passwords;

    public record Ticket(String value) {
        public boolean persistent() { return !value.endsWith(".0"); }
        public static boolean valid(String raw) { return raw != null && raw.matches("[A-Za-z0-9_-]{43}(?:\\.[01])?"); }
        @Override public String toString() { return "Ticket[redacted]"; }
    }
    public record View(boolean mfaRequired, boolean enrollmentRequired, boolean verified, boolean passkeyAvailable,
            boolean totpAvailable, String purpose, LocalDateTime expiresAt, boolean canDeferEnrollment) { }
    public record CredentialView(String id, String kind, String name, LocalDateTime createdAt, LocalDateTime lastUsedAt) { }
    public record Settings(boolean available, boolean enabled, boolean required, List<CredentialView> credentials, long recoveryCodes) { }
    public record TotpSetup(String secret, String uri) {
        @Override public String toString() { return "TotpSetup[redacted]"; }
    }
    public record Completion(TokenProvider.IssuedSession session) {
        @Override public String toString() { return "Completion[redacted]"; }
    }
    // 실패 횟수는 잘못된 인증 응답과 함께 커밋한다.
    public static class RejectedProof extends AuthException {
        RejectedProof() { super("인증 정보를 확인하지 못했어요. 다시 시도해주세요.", org.springframework.http.HttpStatus.BAD_REQUEST); }
    }
    private Clock clock = Clock.systemUTC();
    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setClock(Clock clock) { this.clock = clock.withZone(ZoneOffset.UTC); }
    private LocalDateTime now() { return LocalDateTime.now(clock); }

    @Transactional
    public Ticket beginLogin(Member authenticated, LocalDateTime oauthAt) {
        return beginLogin(authenticated, oauthAt, null);
    }
    @Transactional
    public Ticket beginLogin(Member authenticated, LocalDateTime oauthAt, Instant proofExpiresAt) { return beginLogin(authenticated, oauthAt, proofExpiresAt, true); }
    @Transactional
    public Ticket beginLogin(Member authenticated, LocalDateTime oauthAt, Instant proofExpiresAt, boolean persistent) {
        if (proofExpiresAt != null && !proofExpiresAt.isAfter(clock.instant())) throw expired();
        int expectedVersion = authenticated.getAuthVersion();
        Member member = lock(authenticated.getId());
        if (member.getAuthVersion() != expectedVersion || !tokens.isPrimaryLoginCurrent(member, oauthAt,
                oauthAt == null ? "PASSWORD" : "OAUTH")) throw expired();
        if (!policy.requires(member)) return null;
        return ticket(member, MfaChallenge.Purpose.LOGIN, oauthAt == null ? "PASSWORD" : "OAUTH", oauthAt, null, proofExpiresAt, persistent);
    }
    @Transactional
    public Ticket beginPasskeyLogin() { return beginPasskeyLogin(true); }
    @Transactional
    public Ticket beginPasskeyLogin(boolean persistent) {
        requireAvailable();
        return ticket(null, MfaChallenge.Purpose.PASSKEY_LOGIN, "PASSKEY", null, null, null, persistent);
    }
    @Transactional
    public Ticket beginManage(Member authenticated, String sessionId, LocalDateTime oauthAt, String password) { return beginManage(authenticated, sessionId, oauthAt, password, true); }
    @Transactional
    public Ticket beginManage(Member authenticated, String sessionId, LocalDateTime oauthAt, String password, boolean persistent) {
        int expectedVersion = authenticated.getAuthVersion();
        Member member = lock(authenticated.getId());
        if (!enabled(member)) requireAvailable();
        if (member.getAuthVersion() != expectedVersion) throw expired();
        var session = sessions.findBySessionIdForUpdate(sessionId, member.getId()).filter(value -> value.isLiveAt(now()))
                .orElseThrow(MfaService::expired);
        boolean local = password != null && password.length() <= 64 && member.getPassword() != null
                && passwords.matches(password, member.getPassword());
        boolean social = oauthAt != null && oauthAt.isAfter(now().minusMinutes(5)) && !oauthAt.isAfter(now().plusSeconds(30))
                && tokens.isPrimaryLoginCurrent(member, oauthAt, "OAUTH");
        boolean protectedSession = enabled(member) && MfaPolicy.strong(session.getLoginMethod());
        if (password != null && !password.isBlank() && !local || !local && !social && !protectedSession)
            throw AuthException.badRequest("비밀번호 또는 연결한 소셜 계정으로 다시 확인해주세요.");
        String method = local ? "PASSWORD" : social ? "OAUTH"
                : "PASSKEY".equals(session.getLoginMethod()) ? "PASSKEY"
                : session.getLoginMethod().startsWith("OAUTH") ? "OAUTH" : "PASSWORD";
        // 선택 등록 계정은 기본 인증으로 관리하되 MFA 완료 세션으로 승격하지 않아요.
        if (!member.isAdmin() && (local || social)) method += "_MANAGE";
        return ticket(member, MfaChallenge.Purpose.MANAGE, method, method.startsWith("OAUTH") ? session.getOauthAuthenticatedAt() : null, session.getSessionId(), null, persistent);
    }
    private Ticket ticket(Member member, MfaChallenge.Purpose purpose, String method, LocalDateTime oauthAt, String sid, Instant proofExpiresAt, boolean persistent) {
        // 유지 선택도 요청 해시에 포함해 중간에 바뀌지 않게 한다.
        String raw = crypto.randomToken() + (persistent ? ".1" : ".0");
        MfaChallenge challenge = new MfaChallenge(MfaCrypto.digest(raw), member == null ? null : member.getId(), purpose, method,
                member == null ? 0 : member.getAuthVersion(), oauthAt, now().plusMinutes(5));
        if (purpose == MfaChallenge.Purpose.MANAGE && primaryManagement(challenge)) challenge.verified();
        if (proofExpiresAt != null) challenge.limitExpiry(LocalDateTime.ofInstant(proofExpiresAt, ZoneOffset.UTC));
        challenge.bindSession(sid);
        challenges.save(challenge);
        return new Ticket(raw);
    }
    @Transactional
    public void cancel(String raw) {
        if (!Ticket.valid(raw)) return;
        challenges.findLocked(MfaCrypto.digest(raw)).ifPresent(value -> value.consume(now()));
    }
    @Transactional(readOnly = true)
    public Settings settings(Member authenticated) {
        Member member = members.findByIdAndDeletedAtIsNull(authenticated.getId()).orElseThrow(MfaService::expired);
        List<CredentialView> result = credentials.findByMemberIdOrderByCreatedAtAsc(member.getId()).stream()
                .map(value -> new CredentialView(value.getId(), value.getKind().name(), value.getName(), value.getCreatedAt(), value.getLastUsedAt())).toList();
        return new Settings(properties.isEnabled(), enabled(member), member.isAdmin(), result, recovery.countByMemberId(member.getId()));
    }
    @Transactional
    public View status(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        return view(bound.member(), bound.challenge());
    }
    private View view(Member member, MfaChallenge challenge) {
        List<MfaCredential> values = member == null ? List.of() : credentials.findByMemberIdOrderByCreatedAtAsc(member.getId());
        return new View(true, member != null && !enabled(member), challenge.isFactorVerified(),
                values.stream().anyMatch(value -> value.getKind() == MfaCredential.Kind.PASSKEY),
                values.stream().anyMatch(value -> value.getKind() == MfaCredential.Kind.TOTP), challenge.getPurpose().name(), challenge.getExpiresAt(), canDefer(member, challenge));
    }
    @Transactional
    public TotpSetup beginTotp(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireEnrollment(bound);
        if (credentials.existsByMemberIdAndKind(bound.member().getId(), MfaCredential.Kind.TOTP))
            throw AuthException.badRequest("이미 인증 앱이 연결돼 있어요.");
        String secret = crypto.newTotpSecret();
        bound.challenge().pendingSecret(crypto.encrypt(secret, bound.member().getId()));
        String label = java.net.URLEncoder.encode("RESERVE:" + account(bound.member()).getUserHandle(), java.nio.charset.StandardCharsets.UTF_8);
        return new TotpSetup(secret, "otpauth://totp/" + label + "?secret=" + secret + "&issuer=RESERVE&algorithm=SHA1&digits=6&period=30");
    }
    @Transactional(noRollbackFor = RejectedProof.class)
    public List<String> confirmTotp(String ticket, Member authenticated, String sid, String code) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireEnrollment(bound);
        String secret = bound.challenge().getPendingSecret();
        if (secret == null) throw rejected(bound.challenge());
        long step = crypto.match(crypto.decrypt(secret, bound.member().getId()), code, clock.instant(), -1);
        if (step < 0) throw rejected(bound.challenge());
        if (credentials.existsByMemberIdAndKind(bound.member().getId(), MfaCredential.Kind.TOTP))
            throw AuthException.badRequest("이미 인증 앱이 연결돼 있어요.");
        credentials.save(MfaCredential.totp(bound.member().getId(), secret, step, now()));
        return enrolled(bound);
    }
    @Transactional
    public String beginPasskey(String ticket, Member authenticated, String sid, boolean registration) {
        Bound bound = bound(ticket, authenticated, sid, null);
        if (registration) {
            requireEnrollment(bound);
            if (credentials.findByMemberIdOrderByCreatedAtAsc(bound.member().getId()).size() >= 6)
                throw AuthException.badRequest("등록 가능한 인증 수단 수를 초과했어요.");
            return passkeys.beginRegistration(account(bound.member()), bound.challenge());
        }
        if (bound.member() != null && !credentials.existsByMemberIdAndKind(bound.member().getId(), MfaCredential.Kind.PASSKEY))
            throw AuthException.badRequest("등록된 패스키가 없어요.");
        return passkeys.beginAssertion(bound.member() == null ? null : account(bound.member()), bound.challenge());
    }
    @Transactional(noRollbackFor = RejectedProof.class)
    public List<String> confirmPasskey(String ticket, Member authenticated, String sid, String response, String name) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireEnrollment(bound);
        if (response == null || response.length() > 65_536) throw rejected(bound.challenge());
        com.yubico.webauthn.RegistrationResult result;
        try { result = passkeys.finishRegistration(bound.challenge(), response); }
        catch (IllegalArgumentException e) { throw rejected(bound.challenge()); }
        String id = result.getKeyId().getId().getBase64Url();
        if (id.length() > 2048 || result.getPublicKeyCose().getBase64Url().length() > 4096
                || credentials.findBySlotKey("PASSKEY:" + MfaCrypto.digest(id)).isPresent()) throw rejected(bound.challenge());
        String label = name == null || name.isBlank() ? "패스키" : name.strip();
        if (label.length() > 80 || label.codePoints().anyMatch(Character::isISOControl)) throw AuthException.badRequest("인증 수단 이름을 확인해주세요.");
        credentials.save(MfaCredential.passkey(bound.member().getId(), label, id, MfaCrypto.digest(id),
                result.getPublicKeyCose().getBase64Url(), result.getSignatureCount(), null,
                result.isBackupEligible(), result.isBackedUp(), now()));
        return enrolled(bound);
    }
    @Transactional(noRollbackFor = RejectedProof.class)
    public View verify(String ticket, Member authenticated, String sid, String kind, String proof) {
        Long located = null;
        if ("PASSKEY".equals(kind) && proof != null && proof.length() <= 65_536) {
            try { located = passkeys.locate(proof).getMemberId(); }
            catch (IllegalArgumentException ignored) { }
        }
        Bound bound = bound(ticket, authenticated, sid, located);
        Member member = bound.member();
        if (member == null || !enabled(member)) throw rejected(bound.challenge());
        if (!limiter.tryConsume("mfa-member:" + member.getId(), kr.it.reserve.global.ratelimit.RateLimiter.Policy.CODE_VERIFY_ACCOUNT))
            throw new AuthException("인증 시도가 많아요. 잠시 후 다시 시도해주세요.", org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
        if ("TOTP".equals(kind)) {
            MfaCredential value = currentCredential("TOTP:" + member.getId(), member.getId());
            if (value == null) throw rejected(bound.challenge());
            long step = crypto.match(crypto.decrypt(value.getSecretCiphertext(), member.getId()), proof, clock.instant(), value.getLastAcceptedStep());
            if (step < 0) throw rejected(bound.challenge());
            value.usedTotp(step, now());
        } else if ("BACKUP".equals(kind)) {
            if (bound.challenge().getPurpose() == MfaChallenge.Purpose.PASSKEY_LOGIN || proof == null || proof.length() > 128)
                throw rejected(bound.challenge());
            var code = recovery.findLocked(MfaCrypto.digest(member.getId() + ":" + proof.strip()), member.getId()).orElse(null);
            if (code == null) throw rejected(bound.challenge());
            entityManager.refresh(code, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
            recovery.delete(code);
            changed(member, bound.challenge());
            bound.challenge().loginContinuation();
        } else if ("PASSKEY".equals(kind)) {
            if (proof == null || proof.length() > 65_536) throw rejected(bound.challenge());
            com.yubico.webauthn.AssertionResult result;
            try { result = passkeys.finishAssertion(account(member), bound.challenge(), proof); }
            catch (IllegalArgumentException e) { throw rejected(bound.challenge()); }
            var value = currentCredential("PASSKEY:" + MfaCrypto.digest(result.getCredentialId().getBase64Url()), member.getId());
            if (value == null || value.isBackupEligible() != result.isBackupEligible()
                    || !value.isBackupEligible() && (value.getSignatureCount() > 0 || result.getSignatureCount() > 0)
                    && result.getSignatureCount() <= value.getSignatureCount()) throw rejected(bound.challenge());
            value.usedPasskey(Math.max(value.getSignatureCount(), result.getSignatureCount()), result.isBackedUp(), now());
        } else { throw rejected(bound.challenge()); }
        bound.challenge().verified();
        return view(member, bound.challenge());
    }
    @Transactional
    public Completion finish(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        if (!bound.challenge().isFactorVerified() || bound.member() == null) throw expired();
        MfaChallenge challenge = bound.challenge();
        challenge.consume(now());
        if (challenge.getPurpose() == MfaChallenge.Purpose.MANAGE) return new Completion(null);
        if (primaryManagement(challenge))
            return new Completion(tokens.issueSession(bound.member(), challenge.getOauthAt(), new Ticket(ticket).persistent()));
        String method = "PASSKEY".equals(challenge.getPrimaryMethod()) ? "PASSKEY" : challenge.getPrimaryMethod() + "_MFA";
        return new Completion(tokens.issueVerifiedSession(bound.member(), challenge.getOauthAt(), method, new Ticket(ticket).persistent()));
    }
    private boolean canDefer(Member member, MfaChallenge challenge) {
        return member != null && !member.isAdmin() && policy.offersEnrollment(member) && !enabled(member)
                && challenge.getPurpose() == MfaChallenge.Purpose.LOGIN && !challenge.isFactorVerified();
    }
    @Transactional
    public Completion deferEnrollment(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        if (!canDefer(bound.member(), bound.challenge())) throw expired();
        bound.challenge().consume(now());
        return new Completion(tokens.issueSession(bound.member(), bound.challenge().getOauthAt(), new Ticket(ticket).persistent()));
    }
    @Transactional
    public List<String> regenerateRecovery(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireVerifiedManage(bound);
        changed(bound.member(), bound.challenge());
        bound.challenge().loginContinuation();
        return recoveryCodes(bound.member().getId());
    }
    @Transactional
    public void remove(String ticket, Member authenticated, String sid, String credentialId) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireVerifiedManage(bound);
        var values = credentials.findByMemberIdOrderByCreatedAtAsc(bound.member().getId());
        var value = credentials.findByIdAndMemberId(credentialId, bound.member().getId()).orElseThrow(MfaService::expired);
        if (values.size() <= 1) {
            if (bound.member().isAdmin()) throw AuthException.badRequest("관리자의 마지막 인증 수단은 해제할 수 없어요.");
            disable(bound);
            return;
        }
        credentials.delete(value);
        changed(bound.member(), bound.challenge());
        bound.challenge().consume(now());
    }
    @Transactional
    public void disable(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireVerifiedManage(bound);
        disable(bound);
    }
    private void disable(Bound bound) {
        if (bound.member().isAdmin()) throw AuthException.forbidden("관리자는 추가 인증을 유지해야 해요.");
        credentials.deleteByMemberId(bound.member().getId());
        recovery.deleteByMemberId(bound.member().getId());
        account(bound.member()).disable();
        changed(bound.member(), bound.challenge());
        bound.challenge().consume(now());
    }
    private List<String> enrolled(Bound bound) {
        boolean first = !enabled(bound.member());
        account(bound.member()).enable();
        bound.challenge().verified();
        changed(bound.member(), bound.challenge());
        bound.challenge().loginContinuation();
        return first ? recoveryCodes(bound.member().getId()) : List.of();
    }
    private void changed(Member member, MfaChallenge challenge) {
        member.rotateAuthVersion();
        sessions.deleteByMemberId(member.getId());
        events.publishEvent(new kr.it.reserve.member.service.LoginMethodNotifications.Changed(member.getEmail()));
        challenge.updateAuthVersion(member.getAuthVersion());
        // 인증 수단 변경 뒤에는 기존 관리 세션을 다시 사용할 수 없다.
        if (challenge.getPurpose() == MfaChallenge.Purpose.MANAGE) challenge.bindSession(null);
    }
    private List<String> recoveryCodes(Long memberId) {
        recovery.deleteByMemberId(memberId);
        recovery.flush();
        List<String> result = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            String code = crypto.randomToken().substring(0, 24);
            recovery.save(new MfaRecoveryCode(MfaCrypto.digest(memberId + ":" + code), memberId));
            result.add(code);
        }
        return List.copyOf(result);
    }
    private record Bound(Member member, MfaChallenge challenge) { }
    private Bound bound(String raw, Member authenticated, String sid, Long locatedMember) {
        if (!Ticket.valid(raw)) throw expired();
        String digest = MfaCrypto.digest(raw);
        var snapshot = challenges.findById(digest).orElseThrow(MfaService::expired);
        Long expectedMember = snapshot.getMemberId();
        Long id = expectedMember == null ? locatedMember : expectedMember;
        Member member = id == null ? null : lock(id);
        var challenge = challenges.findLocked(digest).orElseThrow(MfaService::expired);
        entityManager.refresh(challenge, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (!challenge.active(now()) || !Objects.equals(expectedMember, challenge.getMemberId())) throw expired();
        if (member != null && challenge.getMemberId() != null && (member.getAuthVersion() != challenge.getAuthVersion()
                || member.isAdmin() && primaryManagement(challenge)
                || !tokens.isPrimaryLoginCurrent(member, challenge.getOauthAt(), primaryMethod(challenge)))) throw expired();
        if (challenge.getPurpose() != MfaChallenge.Purpose.MANAGE && authenticated != null && member != null
                && !authenticated.getId().equals(member.getId())) throw expired();
        if (challenge.getPurpose() == MfaChallenge.Purpose.MANAGE && (authenticated == null || member == null
                || !member.getId().equals(authenticated.getId()) || member.getAuthVersion() != authenticated.getAuthVersion()
                || challenge.getBoundSessionId() == null || !challenge.getBoundSessionId().equals(sid)
                || sessions.findBySessionIdForUpdate(sid, member.getId()).filter(value -> value.isLiveAt(now())).isEmpty())) throw expired();
        if (challenge.getPurpose() == MfaChallenge.Purpose.PASSKEY_LOGIN && challenge.getMemberId() == null && member != null)
            challenge.bindMember(member.getId(), member.getAuthVersion());
        return new Bound(member, challenge);
    }
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public void erase(Long memberId) {
        credentials.deleteByMemberId(memberId);
        recovery.deleteByMemberId(memberId);
        challenges.deleteByMemberId(memberId);
        accounts.deleteById(memberId);
    }
    private Member lock(Long memberId) {
        Member value = members.findActiveByIdForUpdate(memberId).orElseThrow(MfaService::expired);
        entityManager.flush();
        entityManager.refresh(value, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (value.isDeleted() || value.isSuspended()) throw expired();
        return value;
    }
    private MfaCredential currentCredential(String slot, Long memberId) {
        var value = credentials.findLockedSlot(slot).orElse(null);
        if (value != null) entityManager.refresh(value, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        return value != null && value.getMemberId().equals(memberId) ? value : null;
    }
    private boolean enabled(Member member) { return accounts.findById(member.getId()).map(MfaAccount::isEnabled).orElse(false); }
    private MfaAccount account(Member member) {
        return accounts.findById(member.getId()).orElseGet(() -> accounts.save(new MfaAccount(member.getId(), now())));
    }
    private void requireAvailable() {
        if (!properties.isEnabled()) throw AuthException.badRequest("추가 인증 등록을 준비하고 있어요.");
    }
    private void requireEnrollment(Bound bound) {
        requireAvailable();
        if (bound.member() == null || bound.challenge().getPurpose() == MfaChallenge.Purpose.PASSKEY_LOGIN
                || enabled(bound.member()) && !bound.challenge().isFactorVerified()) throw expired();
    }
    private void requireVerifiedManage(Bound bound) {
        if (bound.challenge().getPurpose() != MfaChallenge.Purpose.MANAGE || !bound.challenge().isFactorVerified()) throw expired();
    }
    private static boolean primaryManagement(MfaChallenge challenge) {
        return "PASSWORD_MANAGE".equals(challenge.getPrimaryMethod()) || "OAUTH_MANAGE".equals(challenge.getPrimaryMethod());
    }
    private static String primaryMethod(MfaChallenge challenge) {
        return switch (challenge.getPrimaryMethod()) {
            case "PASSWORD_MANAGE" -> "PASSWORD";
            case "OAUTH_MANAGE" -> "OAUTH";
            default -> challenge.getPrimaryMethod();
        };
    }
    private RejectedProof rejected(MfaChallenge challenge) { challenge.failed(); challenge.clearCeremony(); return new RejectedProof(); }
    private static AuthException expired() { return new AuthException("인증을 다시 시작해주세요."); }
}
