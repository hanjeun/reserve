package kr.it.reserve.member.mfa;

import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.global.error.AuthException;
import kr.it.reserve.global.persistence.CurrentLockedState;
import kr.it.reserve.global.ratelimit.RateLimiter;
import kr.it.reserve.global.security.PasswordPolicy;
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
    private static final String RECOVERY_EMAIL_METHOD = "RECOVERY_EMAIL";
    static final long RECOVERY_EMAIL_TTL_SECONDS = 300;
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
    @org.springframework.beans.factory.annotation.Autowired(required = false) private LocalAdminMfaReset localAdminReset;
    @org.springframework.beans.factory.annotation.Autowired(required = false) private kr.it.reserve.global.security.ip.IpLoginProtection ipProtection;
    @org.springframework.beans.factory.annotation.Autowired @org.springframework.context.annotation.Lazy private kr.it.reserve.email.service.EmailService email;

    public record Ticket(String value) {
        public boolean persistent() { return !value.endsWith(".0"); }
        public static boolean valid(String raw) { return raw != null && raw.matches("[A-Za-z0-9_-]{43}(?:\\.[01])?"); }
        @Override public String toString() { return "Ticket[redacted]"; }
    }
    public record View(boolean mfaRequired, boolean enrollmentRequired, boolean verified, boolean passkeyAvailable,
            boolean totpAvailable, String purpose, LocalDateTime expiresAt, boolean canDeferEnrollment, boolean emailAvailable,
            String completionId, boolean rememberedBrowser, boolean passkeyOnly, boolean recoveryCodeAvailable) {
        public View(boolean required, boolean enrollment, boolean verified, boolean passkey, boolean totp, String purpose,
                LocalDateTime expiresAt, boolean canDefer, boolean emailAvailable, String completionId) {
            this(required, enrollment, verified, passkey, totp, purpose, expiresAt, canDefer, emailAvailable, completionId, false, false, false);
        }
        public View(boolean required, boolean enrollment, boolean verified, boolean passkey, boolean totp, String purpose,
                LocalDateTime expiresAt, boolean canDefer, boolean emailAvailable) {
            this(required, enrollment, verified, passkey, totp, purpose, expiresAt, canDefer, emailAvailable, null);
        }
        public View(boolean required, boolean enrollment, boolean verified, boolean passkey, boolean totp, String purpose, LocalDateTime expiresAt, boolean canDefer) {
            this(required, enrollment, verified, passkey, totp, purpose, expiresAt, canDefer, false);
        }
        @Override public String toString() { return "View[authentication metadata]"; }
    }
    public record CredentialView(String id, String kind, String name, LocalDateTime createdAt, LocalDateTime lastUsedAt) { }
    public record Settings(boolean available, boolean enabled, boolean required, List<CredentialView> credentials, long recoveryCodes,
                           boolean localAdminResetAvailable) {
        public Settings(boolean available, boolean enabled, boolean required, List<CredentialView> credentials, long recoveryCodes) {
            this(available, enabled, required, credentials, recoveryCodes, false);
        }
    }
    public record RecoveryRenewal(List<String> codes, TokenProvider.IssuedSession session) {
        @Override public String toString() { return "RecoveryRenewal[redacted]"; }
    }
    public record Enrollment(List<String> codes, TokenProvider.IssuedSession session) {
        @Override public String toString() { return "Enrollment[redacted]"; }
    }
    public record Verification(View view, TokenProvider.IssuedSession session) {
        @Override public String toString() { return "Verification[redacted]"; }
    }
    public record TotpSetup(String secret, String uri) {
        @Override public String toString() { return "TotpSetup[redacted]"; }
    }
    public record Completion(TokenProvider.IssuedSession session, boolean browserRegistrationAvailable) {
        public Completion(TokenProvider.IssuedSession session) { this(session, false); }
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
        boolean mandatory = policy.requires(member);
        if (!mandatory && (ipProtection == null || !ipProtection.needsStepUp(member))) return null;
        var pending = ticket(member, MfaChallenge.Purpose.LOGIN,
                (oauthAt == null ? "PASSWORD" : "OAUTH") + (mandatory ? "" : "_RISK"), oauthAt, null, proofExpiresAt, persistent);
        if (!mandatory) ipProtection.bind(pending.value(), member);
        return pending;
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
        return beginManage(authenticated, sessionId, oauthAt, password, persistent, null);
    }
    @Transactional
    public Ticket beginManage(Member authenticated, String sessionId, LocalDateTime oauthAt, String password, boolean persistent, String previousTicket) {
        return beginManagement(authenticated, sessionId, oauthAt, password, persistent, previousTicket, null).ticket();
    }
    private record ManagementStart(Ticket ticket, boolean primaryVerified) { }
    private ManagementStart beginManagement(Member authenticated, String sessionId, LocalDateTime oauthAt, String password, boolean persistent,
            String previousTicket, SensitiveAction action) {
        int expectedVersion = authenticated.getAuthVersion();
        Member member = lock(authenticated.getId());
        boolean enrolled = enabled(member);
        if (action == null && !enrolled) requireAvailable();
        if (member.getAuthVersion() != expectedVersion) throw expired();
        var session = sessions.findBySessionIdForUpdate(sessionId, member.getId()).filter(value -> value.isLiveAt(now()))
                .orElseThrow(MfaService::expired);
        if (action == SensitiveAction.DEVICES && !validDeviceSession(member, session)) throw expired();
        boolean passwordAttempt = password != null && !password.isBlank();
        String limitKey = "mfa-manage-member:" + member.getId();
        if (passwordAttempt && !limiter.tryConsume(limitKey, kr.it.reserve.global.ratelimit.RateLimiter.Policy.CODE_VERIFY_ACCOUNT))
            throw new AuthException("인증 시도가 많아요. 잠시 후 다시 시도해주세요.", org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
        boolean local = password != null && password.length() <= 64 && member.getPassword() != null
                && passwords.matches(password, member.getPassword());
        if (local) limiter.refund(limitKey, kr.it.reserve.global.ratelimit.RateLimiter.Policy.CODE_VERIFY_ACCOUNT);
        boolean social = oauthAt != null && oauthAt.isAfter(now().minusMinutes(5)) && !oauthAt.isAfter(now().plusSeconds(30))
                && tokens.isPrimaryLoginCurrent(member, oauthAt, "OAUTH");
        boolean protectedSession = enrolled && MfaPolicy.strong(session.getLoginMethod());
        boolean deviceFactor = action == SensitiveAction.DEVICES && enrolled && !passwordAttempt;
        if (passwordAttempt && !local || !local && !social && !protectedSession && !deviceFactor)
            throw AuthException.badRequest("비밀번호 또는 연결한 소셜 계정으로 다시 확인해주세요.");
        String method = local ? "PASSWORD" : social ? "OAUTH"
                : "PASSKEY".equals(session.getLoginMethod()) ? "PASSKEY"
                : session.getLoginMethod().startsWith("OAUTH") ? "OAUTH" : "PASSWORD";
        // 선택 등록 계정은 기본 인증으로 관리하되 MFA 완료 세션으로 승격하지 않아요.
        if (!requiresStrongManagement(member) && (local || social)) {
            boolean recheck = action == null && ipProtection != null && ipProtection.needsStepUp(member);
            method += recheck ? "_CHECK" : "_MANAGE";
        }
        if (Ticket.valid(previousTicket)) challenges.findLocked(MfaCrypto.digest(previousTicket))
                .filter(value -> (value.getPurpose() == MfaChallenge.Purpose.MANAGE || value.getPurpose().adminProtection())
                        && Objects.equals(value.getMemberId(), member.getId()) && Objects.equals(value.getBoundSessionId(), sessionId))
                .ifPresent(value -> value.consume(now()));
        Ticket pending = ticket(member, MfaChallenge.Purpose.MANAGE, method, method.startsWith("OAUTH") ? session.getOauthAuthenticatedAt() : null, session.getSessionId(), null, persistent);
        if (ipProtection != null && ipProtection.enabled()) ipProtection.bind(pending.value(), member);
        return new ManagementStart(pending, local || social);
    }
    @Transactional
    public Ticket beginAdminProtection(Member authenticated, String sid, boolean persistent, String previous, Member target, boolean resend) {
        AdminSession current = requireAdminSession(authenticated, sid);
        Member admin = current.member();
        if (Ticket.valid(previous)) challenges.findLocked(MfaCrypto.digest(previous))
                .filter(challenge -> challenge.getPurpose().adminProtection()
                        && Objects.equals(admin.getId(), challenge.getMemberId()) && sid.equals(challenge.getBoundSessionId()))
                .ifPresent(challenge -> challenge.consume(now()));
        var session = current.session();
        String method = session.getLoginMethod();
        String primary = "PASSKEY".equals(method) ? method : method.startsWith("OAUTH") ? "OAUTH" : "PASSWORD";
        Ticket ticket = ticket(admin, adminPurpose(resend), primary, session.getOauthAuthenticatedAt(), sid, null, persistent);
        challenges.findById(MfaCrypto.digest(ticket.value())).orElseThrow(MfaService::expired).bindTarget(target.getId(), target.getAuthVersion());
        if (ipProtection != null && ipProtection.enabled()) ipProtection.bind(ticket.value(), admin);
        return ticket;
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public int consumeAdminProtection(String ticket, Member authenticated, String sid, Long targetId, boolean resend) {
        try {
            requireAdminSession(authenticated, sid);
            var challenge = bound(ticket, authenticated, sid, null).challenge();
            if (challenge.getPurpose() != adminPurpose(resend) || !Objects.equals(targetId, challenge.getTargetMemberId())
                    || challenge.getTargetAuthVersion() == null || !challenge.isFactorVerified()) throw expired();
            challenge.consume(now());
            return challenge.getTargetAuthVersion();
        } catch (AuthException failure) {
            if (failure.getStatus() != org.springframework.http.HttpStatus.UNAUTHORIZED) throw failure;
            throw new AuthException("이 회원의 계정 보호 작업을 다시 확인해주세요.", org.springframework.http.HttpStatus.PRECONDITION_REQUIRED);
        }
    }

    private static MfaChallenge.Purpose adminPurpose(boolean resend) {
        return resend ? MfaChallenge.Purpose.ADMIN_NOTIFY : MfaChallenge.Purpose.ADMIN_PROTECT;
    }

    private record AdminSession(Member member, kr.it.reserve.config.jwt.entity.RefreshToken session) { }

    private AdminSession requireAdminSession(Member authenticated, String sid) {
        if (authenticated == null || !authenticated.isAdmin() || sid == null) throw AuthException.forbidden("관리자 권한이 필요해요.");
        Member admin = lock(authenticated.getId());
        if (!admin.isAdmin() || admin.getAuthVersion() != authenticated.getAuthVersion() || !enabled(admin)) throw expired();
        var session = sessions.findBySessionIdForUpdate(sid, admin.getId()).filter(value -> value.isLiveAt(now())
                && value.getAuthVersion() == admin.getAuthVersion() && MfaPolicy.strong(value.getLoginMethod())).orElseThrow(MfaService::expired);
        return new AdminSession(admin, session);
    }

    public boolean canRecoverAccount(Member member) {
        return enabled(member) && !credentials.findByMemberIdOrderByCreatedAtAsc(member.getId()).isEmpty();
    }

    public record RecoveryEmail(String recipient, String code) {
        @Override public String toString() { return "RecoveryEmail[redacted]"; }
    }

    @Transactional
    public RecoveryEmail issueAccountRecoveryEmail(String email, String reference, Instant expiresAt) {
        var matches = members.findTop2BySecurityContactEmailAndAccountRecoveryDigestIsNotNullAndDeletedAtIsNull(email);
        if (matches.size() != 1) return null;
        Member member = lockMember(matches.getFirst().getId());
        if (!recoveryEligible(member) || !email.equalsIgnoreCase(member.getSecurityContactEmail())
                || email.endsWith(".local") || !canRecoverAccount(member)) return null;
        LocalDateTime deadline = LocalDateTime.ofInstant(expiresAt, ZoneOffset.UTC);
        if (!deadline.isAfter(now()) || !limiter.tryConsume("account-recovery-email-send-member:" + member.getId(), RateLimiter.Policy.EMAIL_SEND)) return null;

        String code = crypto.randomEmailCode();
        var challenge = new MfaChallenge(recoveryEmailDigest(reference), member.getId(), MfaChallenge.Purpose.ACCOUNT_RECOVERY,
                RECOVERY_EMAIL_METHOD, member.getAuthVersion(), null, deadline);
        challenge.pendingSecret(passwords.encode(code));
        challenges.save(challenge);
        return new RecoveryEmail(member.getSecurityContactEmail(), code);
    }

    @Transactional(noRollbackFor = RejectedProof.class)
    public Ticket beginAccountRecoveryWithEmail(String reference, String code) {
        String digest = recoveryEmailDigest(reference);
        var snapshot = challenges.findById(digest).filter(MfaService::isRecoveryEmail).orElse(null);
        Member member = snapshot == null ? null : members.findActiveByIdForUpdate(snapshot.getMemberId()).orElse(null);
        MfaChallenge challenge = recoveryEligible(member) ? challenges.findLocked(digest).orElse(null) : null;
        if (challenge != null) CurrentLockedState.refresh(entityManager, challenge);
        boolean usable = challenge != null && challenge.active(now()) && member.getAuthVersion() == challenge.getAuthVersion()
                && limiter.tryConsume("account-recovery-email-verify-member:" + member.getId(), RateLimiter.Policy.CODE_VERIFY_ACCOUNT);
        String hash = usable ? challenge.getPendingSecret() : null;
        boolean matches = passwords.matches(code, hash == null ? PasswordPolicy.DUMMY_BCRYPT_HASH : hash);
        if (hash == null || !challenge.active(now())) throw new RejectedProof();
        if (!matches) throw rejected(challenge);
        if (!canRecoverAccount(member)) throw new RejectedProof();

        // 복구 코드에 쓴 인증 기록은 같은 트랜잭션에서 한 번만 소비한다.
        challenge.consume(now());
        return ticket(member, MfaChallenge.Purpose.ACCOUNT_RECOVERY, null, null, null, null, false);
    }

    private static String recoveryEmailDigest(String reference) {
        return MfaCrypto.digest("account-recovery-email:" + reference);
    }

    private static boolean isRecoveryEmail(MfaChallenge challenge) {
        return challenge.getPurpose() == MfaChallenge.Purpose.ACCOUNT_RECOVERY && RECOVERY_EMAIL_METHOD.equals(challenge.getPrimaryMethod());
    }

    @Transactional
    public Ticket beginAccountRecovery(String link) {
        if (link == null || !link.matches("[A-Za-z0-9_-]{43}")) throw recoveryExpired();
        String digest = MfaCrypto.digest(link);
        var owner = members.findByAccountRecoveryDigestAndDeletedAtIsNull(digest).orElseThrow(MfaService::recoveryExpired);
        Member member = recoveryMember(owner.getId());
        if (!digest.equals(member.getAccountRecoveryDigest()) || !member.getAccountRecoveryExpiresAt().isAfter(now())
                || !canRecoverAccount(member)) throw recoveryExpired();
        if (!limiter.tryConsume("account-recovery-start:" + member.getId(), kr.it.reserve.global.ratelimit.RateLimiter.Policy.LOGIN_METHOD_VERIFY))
            throw new AuthException("복구 요청이 많아요. 잠시 후 다시 시도해주세요.", org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
        return ticket(member, MfaChallenge.Purpose.ACCOUNT_RECOVERY, null, null, null,
                member.getAccountRecoveryExpiresAt().toInstant(ZoneOffset.UTC), false);
    }

    public record RecoveryMethods(boolean passkeyAvailable, boolean totpAvailable, boolean recoveryCodeAvailable) { }

    @Transactional
    public RecoveryMethods accountRecoveryMethods(String ticket) {
        Long id = recoveryBound(ticket).member().getId();
        var registered = credentials.findByMemberIdOrderByCreatedAtAsc(id);
        return new RecoveryMethods(registered.stream().anyMatch(value -> value.getKind() == MfaCredential.Kind.PASSKEY),
                registered.stream().anyMatch(value -> value.getKind() == MfaCredential.Kind.TOTP), recovery.countByMemberId(id) > 0);
    }

    @Transactional
    public String accountRecoveryOptions(String ticket) {
        var bound = recoveryBound(ticket);
        if (!credentials.existsByMemberIdAndKind(bound.member().getId(), MfaCredential.Kind.PASSKEY)) throw recoveryExpired();
        return passkeys.beginAssertion(account(bound.member()), bound.challenge());
    }

    @Transactional(noRollbackFor = RejectedProof.class)
    public String prepareRecoveryBackup(String ticket, String proof) {
        var bound = recoveryBound(ticket);
        limitRegisteredFactor("account-recovery-member:", bound.member());
        MfaRecoveryCode previous = recoveryCode(bound, proof);
        String prepared = preparedRecoveryCode(bound, previous.getDigest());
        if (prepared != null) return prepared;
        String replacement = crypto.randomToken().substring(0, 24);
        // 보관 확인 전에 연결이 끊겨도 기존 코드는 소비하지 않아요.
        bound.challenge().pendingSecret(crypto.encrypt(previous.getDigest() + ":" + replacement, bound.member().getId()));
        return replacement;
    }

    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY, noRollbackFor = RejectedProof.class)
    public Member verifyAccountRecovery(String ticket, String kind, String proof) {
        var bound = recoveryBound(ticket);
        if (!enabled(bound.member())) throw recoveryExpired();
        limitRegisteredFactor("account-recovery-member:", bound.member());
        if ("BACKUP".equals(kind)) {
            MfaRecoveryCode previous = recoveryCode(bound, proof);
            String replacement = preparedRecoveryCode(bound, previous.getDigest());
            if (replacement == null) throw AuthException.badRequest("새 복구코드를 먼저 보관해주세요.");
            recovery.delete(previous);
            recovery.save(new MfaRecoveryCode(MfaCrypto.digest(bound.member().getId() + ":" + replacement), bound.member().getId()));
        } else verifyRegisteredFactor(bound, kind, proof);
        bound.challenge().consume(now());
        return bound.member();
    }

    private String preparedRecoveryCode(Bound bound, String digest) {
        String pending = bound.challenge().getPendingSecret();
        if (pending == null) return null;
        String saved = crypto.decrypt(pending, bound.member().getId());
        String prefix = digest + ":";
        return saved.startsWith(prefix) ? saved.substring(prefix.length()) : null;
    }

    private Bound recoveryBound(String ticket) {
        if (!Ticket.valid(ticket)) throw recoveryExpired();
        String digest = MfaCrypto.digest(ticket);
        var snapshot = challenges.findById(digest)
                .filter(challenge -> challenge.getPurpose() == MfaChallenge.Purpose.ACCOUNT_RECOVERY && !isRecoveryEmail(challenge))
                .orElseThrow(MfaService::recoveryExpired);
        Member member = recoveryMember(snapshot.getMemberId());
        var challenge = challenges.findLocked(digest).orElseThrow(MfaService::recoveryExpired);
        CurrentLockedState.refresh(entityManager, challenge);
        if (!challenge.active(now()) || member.getAuthVersion() != challenge.getAuthVersion()) throw recoveryExpired();
        return new Bound(member, challenge);
    }

    private Member recoveryMember(Long id) {
        Member member = lockMember(id);
        if (!recoveryEligible(member)) throw recoveryExpired();
        return member;
    }

    private static boolean recoveryEligible(Member member) {
        return member != null && !member.isAdmin() && member.isAccountProtected() && member.getAccountRecoveryExpiresAt() != null;
    }

    private static AuthException recoveryExpired() {
        return AuthException.unauthorized("복구 링크가 만료됐어요. 최근에 받은 메일을 열거나 RESERVE에 문의해주세요.");
    }

    public enum SensitiveAction { LINK, UNLINK, CHANGE, REMOVE, SET, DEVICES }
    public boolean deviceFactorAvailable(Member member, String loginMethod) {
        if (loginMethod == null || !enabled(member)) return false;
        boolean strong = MfaPolicy.strong(loginMethod);
        return strong || Set.of("PASSWORD", "OAUTH").contains(loginMethod) && !policy.mandatory(member, true);
    }
    private boolean validDeviceSession(Member member, RefreshToken session) {
        return session.getAuthVersion() == member.getAuthVersion() && tokens.isSessionLive(member, session, now())
                && tokens.isLoginSessionCurrent(member, session.getOauthAuthenticatedAt(), session.getLoginMethod())
                && (!policy.requires(member) || MfaPolicy.strong(session.getLoginMethod()));
    }
    public record SensitiveProof(LocalDateTime expiresAt, boolean strong, String binding) {
        @Override public String toString() { return "SensitiveProof[redacted]"; }
    }
    @Transactional
    public Ticket beginSensitive(Member authenticated, String sid, LocalDateTime oauthAt, String password,
            boolean persistent, String previous, SensitiveAction action) {
        if (action == null) throw expired();
        ManagementStart started = beginManagement(authenticated, sid, oauthAt, password, persistent, previous, action);
        Ticket pending = started.ticket();
        Bound bound = bound(pending.value(), authenticated, sid, null);
        // 현재 세션만으로 확인을 끝내지 않고, 기기 관리에서는 방금 확인한 로그인 수단도 인정해요.
        boolean extra = !started.primaryVerified() || action != SensitiveAction.DEVICES && requiresStrongManagement(bound.member())
                || ipProtection != null && ipProtection.needsStepUp(bound.member());
        bound.challenge().sensitive(primaryMethod(bound.challenge()) + "_" + action.name(), !extra);
        return pending;
    }
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY, noRollbackFor = AuthException.class)
    public SensitiveProof consumeSensitive(Member member, SensitiveAction action) {
        try { return checkedSensitive(member, action); }
        catch (AuthException failure) {
            if (failure.getStatus() != org.springframework.http.HttpStatus.UNAUTHORIZED) throw failure;
            throw new AuthException("변경 전 본인 확인을 다시 진행해주세요.", org.springframework.http.HttpStatus.PRECONDITION_REQUIRED);
        }
    }
    private SensitiveProof checkedSensitive(Member member, SensitiveAction action) {
        Bound bound = verifiedSensitive(member, action);
        MfaChallenge challenge = bound.challenge();
        challenge.consume(now());
        return new SensitiveProof(challenge.getExpiresAt(), challenge.getPrimaryMethod().endsWith("_MFA"),
                ipProtection == null ? "disabled" : ipProtection.sensitiveBinding(member, challenge.getBoundSessionId()));
    }
    @Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
    public Member requireDeviceManagement(Member member) {
        try {
            return verifiedSensitive(member, SensitiveAction.DEVICES).member();
        } catch (AuthException failure) {
            if (failure.getStatus() != org.springframework.http.HttpStatus.UNAUTHORIZED) throw failure;
            throw new AuthException("기기를 관리하려면 본인 확인을 다시 진행해주세요.", org.springframework.http.HttpStatus.PRECONDITION_REQUIRED);
        }
    }
    private Bound verifiedSensitive(Member member, SensitiveAction action) {
        if (!(org.springframework.web.context.request.RequestContextHolder.getRequestAttributes()
                instanceof org.springframework.web.context.request.ServletRequestAttributes attributes)) throw expired();
        String ticket = kr.it.reserve.config.util.CookieUtil.getCookie(attributes.getRequest(), "mfa_ticket");
        String sid = kr.it.reserve.config.util.SecurityUtil.getSessionId();
        Bound bound = bound(ticket, member, sid, null);
        MfaChallenge challenge = bound.challenge();
        if (!sensitive(challenge) || !sensitiveAction(challenge).equals(action.name()) || !challenge.isFactorVerified()) throw expired();
        boolean strong = challenge.getPrimaryMethod().endsWith("_MFA");
        boolean email = challenge.getPrimaryMethod().endsWith("_MAIL");
        if (action != SensitiveAction.DEVICES && requiresStrongManagement(bound.member()) && !strong
                || !strong && !email && ipProtection != null && ipProtection.needsStepUp(bound.member())) throw expired();
        return bound;
    }
    public String linkBinding(Member member, String sid) { return ipProtection == null ? "disabled" : ipProtection.sensitiveBinding(member, sid); }
    public void prepareLinkedSession(Member member, boolean strong, Boolean remember) {
        if (policy.requires(member) && !strong) throw expired();
        if (ipProtection != null) { ipProtection.approveCurrent(member); ipProtection.prepareBrowser(member, remember); }
    }
    public String browserStatus(Member member) { return ipProtection == null ? "DISABLED" : ipProtection.browserStatus(member); }
    public void writeBrowserCookie(jakarta.servlet.http.HttpServletRequest request, jakarta.servlet.http.HttpServletResponse response) {
        if (ipProtection != null) ipProtection.writeBrowserCookie(request, response);
    }
    public String browserResult() { return ipProtection == null ? "DISABLED" : ipProtection.browserResult(); }
    public void forgetBrowser(Member member) { if (ipProtection != null) ipProtection.forgetBrowser(member); }

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
        return new Settings(properties.isEnabled(), enabled(member), requiresStrongManagement(member), result, recovery.countByMemberId(member.getId()),
                member.isAdmin() && localAdminReset != null && localAdminReset.available());
    }
    @Transactional
    public View status(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        return view(bound.member(), bound.challenge());
    }
    private View view(Member member, MfaChallenge challenge) {
        List<MfaCredential> values = member == null ? List.of() : credentials.findByMemberIdOrderByCreatedAtAsc(member.getId());
        boolean isolated = challenge.getPurpose().adminProtection();
        boolean risk = riskLogin(challenge) || sensitive(challenge) || riskManagement(challenge);
        boolean registered = member != null && enabled(member);
        boolean passkeyOnly = deviceKeyOnly(challenge);
        boolean recoveryCodeAvailable = registered && !challenge.isFactorVerified() && !isolated && !passkeyOnly
                && challenge.getPurpose() != MfaChallenge.Purpose.PASSKEY_LOGIN && recovery.countByMemberId(member.getId()) > 0;
        return new View(true, member != null && !registered && !risk && !isolated, challenge.isFactorVerified(),
                values.stream().anyMatch(value -> value.getKind() == MfaCredential.Kind.PASSKEY),
                !passkeyOnly && values.stream().anyMatch(value -> value.getKind() == MfaCredential.Kind.TOTP),
                riskLogin(challenge) ? "RISK_LOGIN" : challenge.getPurpose().adminProtection() ? "MANAGE" : challenge.getPurpose().name(),
                challenge.getExpiresAt(), canDefer(member, challenge),
                risk && !passkeyOnly && member != null && !registered && !member.isAdmin(), challenge.getId(),
                !isolated && member != null && "REMEMBERED".equals(browserStatus(member)), passkeyOnly, recoveryCodeAvailable);
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
    public Enrollment confirmTotp(String ticket, Member authenticated, String sid, String code) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireEnrollment(bound);
        String secret = bound.challenge().getPendingSecret();
        if (secret == null) throw rejected(bound.challenge());
        long step = crypto.match(crypto.decrypt(secret, bound.member().getId()), code, clock.instant(), -1);
        if (step < 0) throw rejected(bound.challenge());
        if (credentials.existsByMemberIdAndKind(bound.member().getId(), MfaCredential.Kind.TOTP))
            throw AuthException.badRequest("이미 인증 앱이 연결돼 있어요.");
        credentials.save(MfaCredential.totp(bound.member().getId(), secret, step, now()));
        return enrolled(bound, ticket);
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
    public Enrollment confirmPasskey(String ticket, Member authenticated, String sid, String response, String name) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireEnrollment(bound);
        if (response == null || response.length() > 65_536) throw rejected(bound.challenge());
        com.yubico.webauthn.RegistrationResult result;
        try { result = passkeys.finishRegistration(bound.challenge(), response); }
        catch (IllegalArgumentException e) { throw rejected(bound.challenge()); }
        String id = result.getKeyId().getId().getBase64Url();
        if (id.length() > 2048 || result.getPublicKeyCose().getBase64Url().length() > 4096
                || credentials.findBySlotKey("PASSKEY:" + MfaCrypto.digest(id)).isPresent()) throw rejected(bound.challenge());
        String label = credentialName(name);
        credentials.save(MfaCredential.passkey(bound.member().getId(), label, id, MfaCrypto.digest(id),
                result.getPublicKeyCose().getBase64Url(), result.getSignatureCount(), null,
                result.isBackupEligible(), result.isBackedUp(), now()));
        return enrolled(bound, ticket);
    }
    @Transactional(noRollbackFor = RejectedProof.class)
    public Verification verify(String ticket, Member authenticated, String sid, String kind, String proof) {
        Long located = null;
        if ("PASSKEY".equals(kind) && proof != null && proof.length() <= 65_536) {
            try { located = passkeys.locate(proof).getMemberId(); }
            catch (IllegalArgumentException ignored) { }
        }
        Bound bound = bound(ticket, authenticated, sid, located);
        Member member = bound.member();
        boolean emailProof = "EMAIL".equals(kind) && (riskLogin(bound.challenge()) || sensitive(bound.challenge()) || riskManagement(bound.challenge())) && member != null && !member.isAdmin() && !enabled(member);
        if (member == null || !enabled(member) && !emailProof) throw rejected(bound.challenge());
        limitRegisteredFactor("mfa-member:", member);
        if (deviceKeyOnly(bound.challenge()) && !"PASSKEY".equals(kind)
                || bound.challenge().getPurpose().adminProtection() && !Set.of("PASSKEY", "TOTP").contains(kind))
            throw rejected(bound.challenge());
        if (emailProof) {
            if (!ipProtection.verifyEmailCode(ticket, member, proof)) throw rejected(bound.challenge());
            if (riskLogin(bound.challenge()) && member.getSecurityContactEmail() == null && !member.getEmail().endsWith(".local"))
                member.setSecurityContactEmail(member.getEmail());
        } else verifyRegisteredFactor(bound, kind, proof);
        if ("BACKUP".equals(kind)) {
            changed(member, bound.challenge());
            if (bound.challenge().getPurpose() != MfaChallenge.Purpose.MANAGE) bound.challenge().loginContinuation();
        }
        if (riskManagement(bound.challenge())) bound.challenge().sensitive(primaryMethod(bound.challenge()) + (emailProof ? "_MANAGE" : ""), false);
        bound.challenge().sensitiveVerified(!emailProof);
        bound.challenge().verified();
        limiter.refund("mfa-member:" + member.getId(), kr.it.reserve.global.ratelimit.RateLimiter.Policy.CODE_VERIFY_ACCOUNT);
        TokenProvider.IssuedSession replacement = null;
        if ("BACKUP".equals(kind) && bound.challenge().getPurpose() == MfaChallenge.Purpose.MANAGE) {
            // 복구코드 사용으로 폐기한 세션을 교체하고 같은 관리 요청만 새 세션에 이어줘요.
            replacement = continueSession(member, bound.challenge(), ticket, false);
            bound.challenge().bindSession(tokens.getSessionId(replacement.accessToken()));
        }
        return new Verification(view(member, bound.challenge()), replacement);
    }
    private void limitRegisteredFactor(String scope, Member member) {
        if (!limiter.tryConsume(scope + member.getId(), kr.it.reserve.global.ratelimit.RateLimiter.Policy.CODE_VERIFY_ACCOUNT))
            throw new AuthException("인증 시도가 많아요. 잠시 후 다시 시도해주세요.", org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
    }

    private void verifyRegisteredFactor(Bound bound, String kind, String proof) {
        Member member = bound.member();
        if ("TOTP".equals(kind)) {
            MfaCredential value = currentCredential("TOTP:" + member.getId(), member.getId());
            if (value == null) throw rejected(bound.challenge());
            long step = crypto.match(crypto.decrypt(value.getSecretCiphertext(), member.getId()), proof, clock.instant(), value.getLastAcceptedStep());
            if (step < 0) throw rejected(bound.challenge());
            // 잠금 조회의 스냅샷과 별개로 DB에서 인증 구간을 한 번만 소비한다.
            if (credentials.consumeTotp(value.getId(), member.getId(), step, now()) != 1)
                throw rejected(bound.challenge());
            entityManager.refresh(value, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        } else if ("BACKUP".equals(kind)) {
            recovery.delete(recoveryCode(bound, proof));
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
    }

    private MfaRecoveryCode recoveryCode(Bound bound, String proof) {
        if (bound.challenge().getPurpose() == MfaChallenge.Purpose.PASSKEY_LOGIN || proof == null || proof.length() > 128)
            throw rejected(bound.challenge());
        Long id = bound.member().getId();
        var code = recovery.findLocked(MfaCrypto.digest(id + ":" + proof.strip()), id).orElse(null);
        if (code == null) throw rejected(bound.challenge());
        entityManager.refresh(code, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        return code;
    }

    @Transactional
    public java.util.concurrent.CompletableFuture<Void> sendRiskEmail(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        if (!(riskLogin(bound.challenge()) || sensitive(bound.challenge()) || riskManagement(bound.challenge())) || bound.challenge().isFactorVerified() || bound.member().isAdmin() || enabled(bound.member())) throw expired();
        if (!limiter.tryConsume("risk-email-member:" + bound.member().getId(), kr.it.reserve.global.ratelimit.RateLimiter.Policy.LOGIN_METHOD_EMAIL))
            throw new AuthException("인증 요청이 많아요. 잠시 후 다시 시도해주세요.", org.springframework.http.HttpStatus.TOO_MANY_REQUESTS);
        String code = String.format(java.util.Locale.ROOT, "%06d", new java.security.SecureRandom().nextInt(1_000_000));
        ipProtection.issueEmailCode(ticket, bound.member(), code);
        return kr.it.reserve.email.service.EmailDelivery.submit(() -> email.sendRiskLoginVerificationEmail(bound.member().getEmail(), code));
    }
    @Transactional
    public Completion finish(String ticket, Member authenticated, String sid) {
        return finish(ticket, authenticated, sid, null);
    }
    @Transactional
    public Completion finish(String ticket, Member authenticated, String sid, String completionId) {
        return finish(ticket, authenticated, sid, completionId, null);
    }
    @Transactional
    public Completion finish(String ticket, Member authenticated, String sid, String completionId, Boolean rememberBrowser) {
        return finish(ticket, authenticated, sid, completionId, rememberBrowser, false);
    }

    @Transactional
    public Completion finish(String ticket, Member authenticated, String sid, String completionId,
            Boolean rememberBrowser, boolean offerBrowserRegistration) {
        if (completionId != null && (!Ticket.valid(ticket) || !completionId.equals(MfaCrypto.digest(ticket)))) throw expired();
        Bound bound = bound(ticket, authenticated, sid, null);
        if (!bound.challenge().isFactorVerified() || bound.member() == null || sensitive(bound.challenge())
                || bound.challenge().getPurpose().adminProtection()) throw expired();
        MfaChallenge challenge = bound.challenge();
        if (completionId != null && challenge.getPurpose() == MfaChallenge.Purpose.MANAGE) throw expired();
        challenge.consume(now());
        if (challenge.getPurpose() == MfaChallenge.Purpose.MANAGE) return new Completion(null);
        if (ipProtection != null) ipProtection.prepareBrowser(bound.member(), rememberBrowser);
        if (challenge.getBoundSessionId() != null) {
            var existing = sessions.findBySessionIdForUpdate(challenge.getBoundSessionId(), bound.member().getId()).orElse(null);
            // 이미 전달된 관리 등록 세션은 완료 응답 유실에도 같은 브라우저에서 확인한다.
            if (rememberBrowser == null && authenticated != null && Objects.equals(authenticated.getId(), bound.member().getId())
                    && authenticated.getAuthVersion() == bound.member().getAuthVersion() && Objects.equals(sid, challenge.getBoundSessionId())
                    && existing != null && existing.isLiveAt(now()) && existing.getAuthVersion() == bound.member().getAuthVersion()
                    && (!policy.requires(bound.member()) || MfaPolicy.strong(existing.getLoginMethod()))) return new Completion(null);
            if (existing != null) sessions.delete(existing);
        }
        TokenProvider.IssuedSession session;
        boolean risk = riskLogin(challenge);
        if (risk) {
            ipProtection.approveCurrent(bound.member());
            session = tokens.issueSession(bound.member(), challenge.getOauthAt(), new Ticket(ticket).persistent());
        } else session = continueSession(bound.member(), challenge, ticket, challenge.getBoundSessionId() == null);
        challenge.bindSession(tokens.getSessionId(session.accessToken()));
        return new Completion(session, risk && offerBrowserRegistration && completionId != null && rememberBrowser == null);
    }

    @Transactional
    public void confirmCompletion(String completionId, Member authenticated, String sid) {
        completedLogin(completionId, authenticated, sid);
    }

    @Transactional
    public void rememberAfterLogin(String ticket, String completionId, Member authenticated, String sid) {
        if (!Ticket.valid(ticket) || !MfaCrypto.digest(ticket).equals(completionId)) throw expired();
        Bound bound = completedLogin(completionId, authenticated, sid);
        if (!riskLogin(bound.challenge()) || bound.member().isAdmin() || ipProtection == null) throw expired();
        ipProtection.rememberAfterLogin(bound.member(), sid, ticket);
    }

    private Bound completedLogin(String completionId, Member authenticated, String sid) {
        if (authenticated == null || sid == null || completionId == null || !completionId.matches("[a-f0-9]{64}")) throw expired();
        Member member = lock(authenticated.getId());
        var challenge = challenges.findLocked(completionId).orElseThrow(MfaService::expired);
        entityManager.refresh(challenge, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if (challenge.getPurpose() == MfaChallenge.Purpose.MANAGE || challenge.getPurpose().adminProtection()
                || challenge.getPurpose() == MfaChallenge.Purpose.ACCOUNT_RECOVERY || !challenge.isFactorVerified()
                || challenge.getConsumedAt() == null || !now().isBefore(challenge.getExpiresAt())
                || !Objects.equals(challenge.getMemberId(), member.getId())
                || challenge.getAuthVersion() != member.getAuthVersion() || authenticated.getAuthVersion() != member.getAuthVersion()
                || !sid.equals(challenge.getBoundSessionId())
                || !tokens.isPrimaryLoginCurrent(member, challenge.getOauthAt(), primaryMethod(challenge))) throw expired();
        var session = sessions.findBySessionIdForUpdate(sid, member.getId()).filter(value -> value.isLiveAt(now())).orElseThrow(MfaService::expired);
        if (session.getAuthVersion() != member.getAuthVersion() || policy.requires(member) && !MfaPolicy.strong(session.getLoginMethod())) throw expired();
        return new Bound(member, challenge);
    }
    private TokenProvider.IssuedSession continueSession(Member member, MfaChallenge challenge, String ticket, boolean login) {
        boolean persistent = new Ticket(ticket).persistent();
        if (primaryManagement(challenge)) {
            // 인증 버전을 바꾼 뒤에도 같은 환경에서 확인한 관리 작업만 이어줘요.
            if (ipProtection != null) ipProtection.approveCurrent(member);
            return tokens.issueReplacementSession(member, challenge.getOauthAt(), null, persistent);
        }
        String base = primaryMethod(challenge);
        String method = "PASSKEY".equals(base) ? "PASSKEY" : base + "_MFA";
        return login ? tokens.issueVerifiedSession(member, challenge.getOauthAt(), method, persistent)
                : tokens.issueReplacementSession(member, challenge.getOauthAt(), method, persistent);
    }
    private boolean canDefer(Member member, MfaChallenge challenge) {
        return !riskLogin(challenge) && member != null && !member.isAdmin() && policy.offersEnrollment(member) && !enabled(member)
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
    public RecoveryRenewal regenerateRecovery(String ticket, Member authenticated, String sid) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireVerifiedManage(bound);
        changed(bound.member(), bound.challenge());
        var codes = recoveryCodes(bound.member().getId());
        var session = continueSession(bound.member(), bound.challenge(), ticket, false);
        // 재발급 응답에서 현재 브라우저를 갱신해 코드 화면을 닫아도 폐기된 세션으로 돌아가지 않아요.
        bound.challenge().bindSession(tokens.getSessionId(session.accessToken()));
        return new RecoveryRenewal(codes, session);
    }
    @Transactional
    public Settings rename(String ticket, Member authenticated, String sid, String credentialId, String name) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireVerifiedManage(bound);
        var value = credentials.findByIdAndMemberId(credentialId, bound.member().getId()).orElseThrow(MfaService::expired);
        if (value.getKind() != MfaCredential.Kind.PASSKEY || name == null || name.isBlank())
            throw AuthException.badRequest("패스키 이름을 확인해주세요.");
        // 표시 이름 변경은 인증 키·다른 세션·인증 버전을 바꾸지 않는다.
        value.rename(credentialName(name));
        return settings(bound.member());
    }
    private static String credentialName(String name) {
        String label = name == null || name.isBlank() ? "패스키" : name.strip();
        if (label.length() > 80 || label.codePoints().anyMatch(Character::isISOControl))
            throw AuthException.badRequest("인증 수단 이름을 확인해주세요.");
        return label;
    }
    @Transactional
    public Completion remove(String ticket, Member authenticated, String sid, String credentialId) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireVerifiedManage(bound);
        var values = credentials.findByMemberIdOrderByCreatedAtAsc(bound.member().getId());
        var value = credentials.findByIdAndMemberId(credentialId, bound.member().getId()).orElseThrow(MfaService::expired);
        if (values.size() <= 1) {
            if (bound.member().isAdmin()) {
                if (localAdminReset == null || !localAdminReset.claim())
                    throw AuthException.badRequest("관리자의 마지막 인증 수단은 해제할 수 없어요.");
                clearFactors(bound);
                return new Completion(null);
            }
            return disable(bound, ticket, true);
        }
        credentials.delete(value);
        changed(bound.member(), bound.challenge());
        // 다른 인증 수단이 남으면 기존 세션은 폐기하고 확인한 현재 브라우저만 교체한다.
        var replacement = continueSession(bound.member(), bound.challenge(), ticket, false);
        bound.challenge().consume(now());
        return new Completion(replacement);
    }
    @Transactional
    public Completion disable(String ticket, Member authenticated, String sid) {
        return disable(ticket, authenticated, sid, false);
    }
    @Transactional
    public Completion disable(String ticket, Member authenticated, String sid, boolean keepCurrentSession) {
        Bound bound = bound(ticket, authenticated, sid, null);
        requireVerifiedManage(bound);
        return disable(bound, ticket, keepCurrentSession);
    }
    private Completion disable(Bound bound, String ticket, boolean keepCurrentSession) {
        if (bound.member().isAdmin()) throw AuthException.forbidden("관리자는 추가 인증을 유지해야 해요.");
        if (bound.member().isAccountRecoveryMfaRequired()) throw AuthException.forbidden("복구한 계정은 추가 인증을 유지해야 해요.");
        String primary = primaryMethod(bound.challenge());
        clearFactors(bound);
        if (!keepCurrentSession || !"PASSWORD".equals(primary) && !"OAUTH".equals(primary)) return new Completion(null);
        // 해제한 추가 인증으로 권한을 이어주지 않고 확인한 기본 로그인만 유지한다.
        if (ipProtection != null) ipProtection.approveCurrent(bound.member());
        return new Completion(tokens.issueReplacementSession(bound.member(), bound.challenge().getOauthAt(), null, new Ticket(ticket).persistent()));
    }
    private void clearFactors(Bound bound) {
        credentials.deleteByMemberId(bound.member().getId());
        recovery.deleteByMemberId(bound.member().getId());
        account(bound.member()).disable();
        changed(bound.member(), bound.challenge());
        bound.challenge().consume(now());
    }
    private Enrollment enrolled(Bound bound, String ticket) {
        boolean managing = bound.challenge().getPurpose() == MfaChallenge.Purpose.MANAGE;
        boolean first = !enabled(bound.member());
        account(bound.member()).enable();
        bound.challenge().verified();
        changed(bound.member(), bound.challenge());
        bound.challenge().loginContinuation();
        var codes = first ? recoveryCodes(bound.member().getId()) : List.<String>of();
        // 이미 로그인해 관리한 브라우저만 코드 보관 전에 이어준다. 새 로그인은 finish를 기다린다.
        var session = managing ? continueSession(bound.member(), bound.challenge(), ticket, false) : null;
        if (session != null) bound.challenge().bindSession(tokens.getSessionId(session.accessToken()));
        return new Enrollment(codes, session);
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
        if (snapshot.getPurpose() == MfaChallenge.Purpose.ACCOUNT_RECOVERY) throw expired();
        Long expectedMember = snapshot.getMemberId();
        Long id = expectedMember == null ? locatedMember : expectedMember;
        Member member = id == null ? null : lock(id);
        var challenge = challenges.findLocked(digest).orElseThrow(MfaService::expired);
        CurrentLockedState.refresh(entityManager, challenge);
        if (!challenge.active(now()) || !Objects.equals(expectedMember, challenge.getMemberId())) throw expired();
        boolean managing = challenge.getPurpose() == MfaChallenge.Purpose.MANAGE || challenge.getPurpose().adminProtection();
        if (riskLogin(challenge)) {
            if (member == null || member.isAdmin() || ipProtection == null) throw expired();
            ipProtection.requireBinding(raw, member);
        } else if ((managing || primaryManagement(challenge))
                && ipProtection != null && ipProtection.enabled()) ipProtection.requireBinding(raw, member);
        if (member != null && challenge.getMemberId() != null && (member.getAuthVersion() != challenge.getAuthVersion()
                || member.isAdmin() && primaryManagement(challenge)
                || !tokens.isPrimaryLoginCurrent(member, challenge.getOauthAt(), primaryMethod(challenge)))) throw expired();
        if (!managing && authenticated != null && member != null
                && !authenticated.getId().equals(member.getId())) throw expired();
        if (managing && (authenticated == null || member == null
                || !member.getId().equals(authenticated.getId()) || member.getAuthVersion() != authenticated.getAuthVersion()
                || challenge.getBoundSessionId() == null || !challenge.getBoundSessionId().equals(sid)
                || sessions.findBySessionIdForUpdate(sid, member.getId()).filter(value -> value.isLiveAt(now())
                        && (!sensitive(challenge) || !sensitiveAction(challenge).equals(SensitiveAction.DEVICES.name())
                            || validDeviceSession(member, value))).isEmpty())) throw expired();
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
        Member value = lockMember(memberId);
        if (value.isSuspended() || value.isAccountProtected()) throw expired();
        return value;
    }

    private Member lockMember(Long memberId) {
        Member value = members.findActiveByIdForUpdate(memberId).orElseThrow(MfaService::expired);
        CurrentLockedState.refresh(entityManager, value);
        if (value.isDeleted()) throw expired();
        return value;
    }
    private MfaCredential currentCredential(String slot, Long memberId) {
        var value = credentials.findLockedSlot(slot).orElse(null);
        if (value != null) CurrentLockedState.refresh(entityManager, value);
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
        if (bound.member() == null || sensitive(bound.challenge()) || riskManagement(bound.challenge()) || riskLogin(bound.challenge())
                || bound.challenge().getPurpose().adminProtection() || bound.challenge().getPurpose() == MfaChallenge.Purpose.PASSKEY_LOGIN
                || enabled(bound.member()) && !bound.challenge().isFactorVerified()) throw expired();
    }
    private void requireVerifiedManage(Bound bound) {
        if (sensitive(bound.challenge()) || bound.challenge().getPurpose() != MfaChallenge.Purpose.MANAGE || !bound.challenge().isFactorVerified()) throw expired();
    }
    private static boolean requiresStrongManagement(Member member) {
        return member.isAdmin() || member.isAccountRecoveryMfaRequired();
    }

    private static boolean riskManagement(MfaChallenge challenge) {
        return "PASSWORD_CHECK".equals(challenge.getPrimaryMethod()) || "OAUTH_CHECK".equals(challenge.getPrimaryMethod());
    }
    private static boolean primaryManagement(MfaChallenge challenge) {
        return "PASSWORD_MANAGE".equals(challenge.getPrimaryMethod()) || "OAUTH_MANAGE".equals(challenge.getPrimaryMethod());
    }
    private static boolean sensitive(MfaChallenge challenge) {
        return challenge.getPurpose() == MfaChallenge.Purpose.MANAGE && challenge.getPrimaryMethod() != null
                && challenge.getPrimaryMethod().matches("(?:PASSWORD|OAUTH|PASSKEY)_(?:LINK|UNLINK|CHANGE|REMOVE|SET|DEVICES|DEVKEY)(?:_MFA|_MAIL)?");
    }
    private static boolean deviceKeyOnly(MfaChallenge challenge) {
        return sensitive(challenge) && "DEVKEY".equals(challenge.getPrimaryMethod().split("_")[1]);
    }
    private static String sensitiveAction(MfaChallenge challenge) {
        return deviceKeyOnly(challenge) ? SensitiveAction.DEVICES.name() : challenge.getPrimaryMethod().split("_")[1];
    }
    private static String primaryMethod(MfaChallenge challenge) {
        if (sensitive(challenge)) return challenge.getPrimaryMethod().split("_")[0];
        return switch (challenge.getPrimaryMethod()) {
            case "PASSWORD_MANAGE", "PASSWORD_CHECK", "PASSWORD_RISK" -> "PASSWORD";
            case "OAUTH_MANAGE", "OAUTH_CHECK", "OAUTH_RISK" -> "OAUTH";
            default -> challenge.getPrimaryMethod();
        };
    }
    private static boolean riskLogin(MfaChallenge challenge) { return "PASSWORD_RISK".equals(challenge.getPrimaryMethod()) || "OAUTH_RISK".equals(challenge.getPrimaryMethod()); }
    private RejectedProof rejected(MfaChallenge challenge) { challenge.failed(); challenge.clearCeremony(); return new RejectedProof(); }
    private static AuthException expired() { return new AuthException("인증을 다시 시작해주세요."); }
}
