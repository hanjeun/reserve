package kr.it.reserve.member.service;

import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.oauth2.OAuth2UserInfo;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import kr.it.reserve.config.util.CookieUtil;
import kr.it.reserve.email.service.EmailService;
import kr.it.reserve.global.error.BusinessException;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.security.PasswordPolicy;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.member.entity.*;
import kr.it.reserve.member.entity.LoginMethodChallenge.Purpose;
import kr.it.reserve.member.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.Serializable;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** 회원 ID·권한·거래는 유지하고 인증 수단만 변경한다. 잠금 순서는 subject → member → challenge다. */
@Service
@RequiredArgsConstructor
public class LoginMethodService {
    private static final Set<AuthProvider> SOCIAL = Set.of(AuthProvider.NAVER, AuthProvider.KAKAO, AuthProvider.GOOGLE);
    private static final String ISSUED = LoginMethodService.class.getName() + ".issued";
    private static final String BOUND = LoginMethodService.class.getName() + ".bound";
    private static final String COMPLETING = LoginMethodService.class.getName() + ".completing";
    private static final SecureRandom RANDOM = new SecureRandom();
    private final MemberRepository members;
    private final LoginMethodChallengeRepository challenges;
    private final OAuthSubjectSecurityService subjects;
    private final RefreshTokenRepository refreshTokens;
    private final PasswordResetTokenRepository passwordResets;
    private final EmailService emails;
    private final TokenProvider tokens;
    private final PwnedPasswordChecker pwnedPasswords;
    private final org.springframework.context.ApplicationEventPublisher events;
    // SecurityConfig가 OAuth 관문을 생성할 때 encoder bean을 앞당겨 만들지 않는다.
    @Autowired @Lazy private BCryptPasswordEncoder passwords;
    @PersistenceContext private EntityManager entityManager;

    public record Status(Long memberId, boolean passwordEnabled, AuthProvider socialProvider, String email, boolean socialProofFresh,
            AuthProvider linkableSocialProvider) { }
    public record EmailChallenge(String challengeId, Instant expiresAt) { }
    private record Issued(String id, String nonce) implements Serializable { }
    private record Bound(String id, String state) implements Serializable { }

    @Transactional(readOnly = true)
    public Status status(Member authenticated, LocalDateTime oauthAt) {
        Member current = members.findByIdAndDeletedAtIsNull(authenticated.getId()).orElseThrow(this::expired);
        if (current.getAuthVersion() != authenticated.getAuthVersion() || current.isSuspended()) throw expired();
        return new Status(current.getId(), current.getPassword() != null, current.isOAuthUser() ? current.getProvider() : null,
                current.getEmail(), freshSocial(current, oauthAt), current.isOAuthUser() || current.getPassword() == null
                        ? null : providerForEmail(current.getEmail()));
    }

    @Transactional
    public String beginOAuth(Member authenticated, AuthProvider provider, String password, boolean reauthenticate,
            HttpServletRequest request) {
        if (provider == null || !SOCIAL.contains(provider)) throw invalid("지원하지 않는 로그인 방법이에요.");
        Member current = locked(authenticated);
        if (reauthenticate) {
            if (current.getProvider() != provider || !current.isOAuthUser()) throw invalid("연결된 소셜 계정으로 확인해주세요.");
        } else {
            if (current.isOAuthUser()) throw invalid("다른 소셜 계정을 연결하려면 이메일 로그인을 확보한 뒤 기존 연결을 해제해주세요.");
            if (providerForEmail(current.getEmail()) != provider) throw invalid("현재 이메일에 해당하는 소셜 계정만 연결할 수 있어요.");
            requirePassword(current, password);
        }
        LoginMethodChallenge challenge = issue(current, reauthenticate ? Purpose.SOCIAL_REAUTH : Purpose.SOCIAL_LINK,
                provider, null, null);
        byte[] nonce = new byte[32];
        RANDOM.nextBytes(nonce);
        String value = Base64.getUrlEncoder().withoutPadding().encodeToString(nonce);
        HttpSession session = request.getSession();
        request.changeSessionId();
        session.setAttribute(ISSUED, new Issued(challenge.getId(), value));
        session.removeAttribute(BOUND);
        session.removeAttribute(COMPLETING);
        return "/oauth2/authorization/" + provider.name().toLowerCase(Locale.ROOT) + "?account_link=" + value;
    }

    /** 브라우저 세션에 발급한 의도와 Spring의 OAuth state를 묶는다. 공급자에게 nonce를 보내지 않는다. */
    @Transactional(readOnly = true)
    public OAuth2AuthorizationRequest bindOAuth(HttpServletRequest request, OAuth2AuthorizationRequest authorization) {
        if (authorization == null || request.getParameter("account_link") == null) return authorization;
        HttpSession session = request.getSession(false);
        Object stored = session == null ? null : session.getAttribute(ISSUED);
        if (session != null) session.removeAttribute(ISSUED);
        if (!(stored instanceof Issued issued) || !equal(issued.nonce(), request.getParameter("account_link"))) throw oauthExpired();
        LoginMethodChallenge challenge = challenges.findById(issued.id()).orElseThrow(this::oauthExpired);
        Member current = browserMember(request);
        String registration = authorization.getAttribute("registration_id");
        if (!challenge.validFor(current, challenge.getPurpose(), subjects.now())
                || challenge.getPurpose() == Purpose.PASSWORD_SETUP
                || !challenge.getProvider().name().equalsIgnoreCase(registration)) throw oauthExpired();
        session.setAttribute(BOUND, new Bound(challenge.getId(), authorization.getState()));
        if (challenge.getPurpose() != Purpose.SOCIAL_REAUTH) return authorization;
        return OAuth2AuthorizationRequest.from(authorization)
                .additionalParameters(parameters -> {
                    switch (challenge.getProvider()) {
                        case NAVER -> parameters.put("auth_type", "reauthenticate");
                        case KAKAO -> parameters.put("prompt", "login");
                        // Google supports account selection, not forced password entry via prompt=login.
                        case GOOGLE -> {
                            parameters.remove("login_hint");
                            parameters.put("prompt", "select_account");
                        }
                        default -> throw oauthExpired();
                    }
                })
                // from() copies the old URI; rebuild it so the provider receives the new parameters.
                .authorizationRequestUri((String) null)
                .build();
    }

    /** 연결 의도가 있으면 일반 신규 가입으로 돌아가지 않고 같은 회원에 대한 인증만 완료한다. */
    @Transactional
    public Member completeOAuth(HttpServletRequest request, AuthProvider provider, OAuth2UserInfo info,
            String accessToken, LocalDateTime authenticatedAt, Instant tokenExpiresAt) {
        HttpSession session = request == null ? null : request.getSession(false);
        Object stored = session == null ? null : session.getAttribute(BOUND);
        if (!(stored instanceof Bound bound)) {
            if (session != null && session.getAttribute(COMPLETING) != null) throw oauthExpired();
            return null;
        }
        session.removeAttribute(BOUND);
        if (!equal(bound.state(), request.getParameter("state"))) throw oauthExpired();
        session.setAttribute(COMPLETING, bound.id());
        Member browser = browserMember(request);
        int expectedVersion = browser.getAuthVersion();
        var subject = subjects.lock(provider, info.getProviderId());
        Member current = locked(browser.getId(), expectedVersion);
        LoginMethodChallenge challenge = lockedChallenge(bound.id());
        if (!challenge.validFor(current, challenge.getPurpose(), subjects.now()) || challenge.getProvider() != provider
                || challenge.getPurpose() == Purpose.PASSWORD_SETUP) throw oauthExpired();
        subjects.requireFreshAuthentication(authenticatedAt, tokenExpiresAt);
        if (!subject.acceptsAuthentication(authenticatedAt)) throw oauthExpired();
        var owners = members.findActiveIdsByProviderAndProviderIdForUpdate(provider.name(), info.getProviderId());
        if (challenge.getPurpose() == Purpose.SOCIAL_LINK) {
            if (current.isOAuthUser() || current.getPassword() == null || !owners.isEmpty()) throw oauthConflict();
            if (providerForEmail(current.getEmail()) != provider || !sameLinkEmail(current.getEmail(), provider, info))
                throw new OAuth2AuthenticationException("login_method_email_mismatch");
            current.setProvider(provider);
            current.setProviderId(info.getProviderId());
            current.setOauthSecurityRevokedAt(null);
            changed(current);
        } else if (current.getProvider() != provider || !info.getProviderId().equals(current.getProviderId())
                || owners.size() != 1 || !owners.getFirst().equals(current.getId()))
            throw new OAuth2AuthenticationException("login_method_identity_mismatch");
        challenge.consume();
        current.setOauthAccessToken(accessToken);
        current.setOauthAuthenticatedAt(authenticatedAt);
        // 이름·연락처·사진·사업자 권한을 공급자 프로필로 바꾸지 않는다.
        current.setLoginMethodsManaged(true);
        members.flush();
        subjects.requireFreshAuthentication(authenticatedAt, tokenExpiresAt);
        subject.authenticated(authenticatedAt, subjects.now());
        return current;
    }

    @Transactional
    public EmailChallenge sendPasswordCode(Member authenticated, LocalDateTime oauthAt, String email) {
        Member current = locked(authenticated);
        requireFreshSocial(current, oauthAt);
        if (current.getPassword() != null) throw invalid("이미 이메일 로그인을 사용하고 있어요.");
        String normalized = normalizeEmail(email);
        requireAvailableEmail(current, normalized);
        var previous = challenges.findByMemberIdAndPurpose(current.getId(), Purpose.PASSWORD_SETUP);
        if (previous.isPresent() && previous.get().getCreatedAt().isAfter(subjects.now().minusMinutes(1)))
            throw new MemberException("인증 코드는 1분 뒤 다시 받을 수 있어요.", HttpStatus.TOO_MANY_REQUESTS);
        String code = String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
        LoginMethodChallenge challenge = issue(current, Purpose.PASSWORD_SETUP, current.getProvider(), normalized, passwords.encode(code));
        emails.sendLoginMethodVerificationEmail(normalized, code);
        return new EmailChallenge(challenge.getId(), challenge.getExpiresAt().toInstant(ZoneOffset.UTC));
    }

    @Transactional(noRollbackFor = BusinessException.class)
    public void setPassword(Member authenticated, LocalDateTime oauthAt, String challengeId, String code,
            String password, String confirmation) {
        Member current = locked(authenticated);
        requireFreshSocial(current, oauthAt);
        if (current.getPassword() != null) throw invalid("이미 이메일 로그인을 사용하고 있어요.");
        LoginMethodChallenge challenge = lockedChallenge(challengeId);
        if (!challenge.validFor(current, Purpose.PASSWORD_SETUP, subjects.now())) throw invalid("인증 요청이 만료됐어요. 다시 요청해주세요.");
        if (code == null || !code.matches("[0-9]{6}") || !passwords.matches(code, challenge.getCodeHash())) {
            challenge.failAttempt();
            throw invalid("인증 코드가 일치하지 않아요.");
        }
        requireAvailableEmail(current, challenge.getEmail());
        String violation = PasswordPolicy.violation(password);
        if (violation != null) throw invalid(violation);
        if (!PasswordPolicy.matches(password, confirmation)) throw invalid(PasswordPolicy.MISMATCH_MESSAGE);
        if (pwnedPasswords.isPwned(password)) throw invalid("유출된 이력이 있는 비밀번호예요. 다른 비밀번호를 사용해주세요.");
        passwordResets.invalidateForEmail(current.getEmail());
        String previousEmail = current.getEmail();
        current.setEmail(challenge.getEmail());
        current.setPassword(passwords.encode(password));
        challenge.consume();
        changed(current);
        if (!previousEmail.equals(current.getEmail())) events.publishEvent(new LoginMethodNotifications.Changed(previousEmail));
    }

    @Transactional
    public void removePassword(Member authenticated, LocalDateTime oauthAt) {
        Member current = locked(authenticated);
        requireFreshSocial(current, oauthAt);
        if (current.getPassword() == null) throw invalid("이메일 로그인이 설정돼 있지 않아요.");
        current.setPassword(null);
        changed(current);
    }

    @Transactional
    public void unlinkSocial(Member authenticated, String password) {
        AuthProvider provider = authenticated.getProvider();
        String providerId = authenticated.getProviderId();
        int expectedVersion = authenticated.getAuthVersion();
        if (provider == null || !SOCIAL.contains(provider)) throw invalid("연결된 소셜 계정이 없어요.");
        var subject = subjects.lock(provider, providerId);
        Member current = locked(authenticated.getId(), expectedVersion);
        if (current.getProvider() != provider || !providerId.equals(current.getProviderId())) throw expired();
        requirePassword(current, password);
        subject.mergeMemberState(current.getOauthAuthenticatedAt(), current.getOauthSecurityRevokedAt());
        LocalDateTime now = subjects.now();
        subject.revoked(subject.getLastAuthenticatedAt() != null && subject.getLastAuthenticatedAt().isAfter(now)
                ? subject.getLastAuthenticatedAt() : now, now);
        current.setProvider(AuthProvider.LOCAL);
        current.setProviderId(null);
        current.setOauthAccessToken(null);
        current.setOauthAuthenticatedAt(null);
        current.setOauthSecurityRevokedAt(null);
        changed(current);
    }

    @Scheduled(fixedDelay = 900_000)
    @Transactional
    public void removeExpiredChallenges() { challenges.deleteByExpiresAtBefore(subjects.now()); }

    @org.springframework.transaction.event.TransactionalEventListener(phase = org.springframework.transaction.event.TransactionPhase.BEFORE_COMMIT)
    public void removeWithdrawnChallenges(kr.it.reserve.member.event.MemberWithdrawn event) {
        challenges.deleteByMemberId(event.memberId());
    }

    /** 로그아웃과 진행 중 연결의 완료/새 세션 발급을 같은 회원 잠금으로 직렬화한다. */
    @Transactional
    public void cancelOAuth(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session == null) return;
        Object issued = session.getAttribute(ISSUED);
        Object bound = session.getAttribute(BOUND);
        Object completing = session.getAttribute(COMPLETING);
        String id = completing instanceof String value ? value : bound instanceof Bound value ? value.id()
                : issued instanceof Issued value ? value.id() : null;
        if (id == null) return;
        var initial = challenges.findById(id).orElse(null);
        if (initial == null || !subjects.now().isBefore(initial.getExpiresAt())) return;
        if (!logoutOwnsFlow(request, initial.getMember().getId())) return;
        Member current = members.findActiveByIdForUpdate(initial.getMember().getId()).orElse(null);
        if (current == null) return;
        entityManager.refresh(current, LockModeType.PESSIMISTIC_WRITE);
        var challenge = challenges.findForUpdate(id).orElse(null);
        if (challenge == null || challenge.getPurpose() == Purpose.PASSWORD_SETUP) return;
        entityManager.refresh(challenge, LockModeType.PESSIMISTIC_WRITE);
        if (challenge.isConsumed()) {
            current.rotateAuthVersion();
            refreshTokens.deleteByMemberId(current.getId());
        } else challenge.consume();
        session.removeAttribute(ISSUED); session.removeAttribute(BOUND); session.setAttribute(COMPLETING, id);
    }

    /** Refresh proof identifies a cancellation target only; it never authenticates or issues a session. */
    private boolean logoutOwnsFlow(HttpServletRequest request, Long memberId) {
        String access = CookieUtil.getCookie(request, "access_token");
        if (access != null) {
            try { return memberId.equals(tokens.getUserId(access)); }
            catch (io.jsonwebtoken.ExpiredJwtException expired) { /* The refresh cookie can outlive access. */ }
            catch (RuntimeException invalid) { return false; }
        }
        for (String refresh : CookieUtil.getCookieValues(request, "refresh_token")) {
            var proof = tokens.inspectRefreshToken(refresh);
            if (proof != null && (proof.state() == TokenProvider.RefreshTokenState.VALID
                    || proof.state() == TokenProvider.RefreshTokenState.EXPIRED)
                    && memberId.equals(proof.memberId())) return true;
        }
        return false;
    }

    public static void clearFlow(HttpServletRequest request) {
        HttpSession session = request.getSession(false);
        if (session != null) { session.removeAttribute(ISSUED); session.removeAttribute(BOUND); session.removeAttribute(COMPLETING); }
    }

    private LoginMethodChallenge issue(Member member, Purpose purpose, AuthProvider provider, String email, String hash) {
        challenges.findByMemberIdAndPurpose(member.getId(), purpose).ifPresent(challenges::delete);
        challenges.flush();
        return challenges.saveAndFlush(new LoginMethodChallenge(member, purpose, provider, email, hash, subjects.now()));
    }
    private Member locked(Member authenticated) { return locked(authenticated.getId(), authenticated.getAuthVersion()); }
    private LoginMethodChallenge lockedChallenge(String id) {
        LoginMethodChallenge challenge = challenges.findForUpdate(id).orElseThrow(() -> invalid("인증 요청이 만료됐어요. 다시 요청해주세요."));
        entityManager.refresh(challenge, LockModeType.PESSIMISTIC_WRITE);
        return challenge;
    }
    private Member locked(Long id, int expectedVersion) {
        Member current = members.findActiveByIdForUpdate(id).orElseThrow(this::expired);
        entityManager.refresh(current, LockModeType.PESSIMISTIC_WRITE);
        if (current.isSuspended() || current.getAuthVersion() != expectedVersion) throw expired();
        return current;
    }
    private Member browserMember(HttpServletRequest request) {
        String token = CookieUtil.getCookie(request, "access_token");
        if (token == null) throw oauthExpired();
        try { return tokens.getActiveMemberFromToken(token); }
        catch (RuntimeException exception) { throw oauthExpired(); }
    }
    private void changed(Member current) {
        current.setLoginMethodsManaged(true);
        current.rotateAuthVersion();
        refreshTokens.deleteByMemberId(current.getId());
        passwordResets.invalidateForEmail(current.getEmail());
        events.publishEvent(new LoginMethodNotifications.Changed(current.getEmail()));
    }
    private void requirePassword(Member current, String value) {
        if (current.getPassword() == null || value == null || value.length() > 64
                || value.getBytes(StandardCharsets.UTF_8).length > PasswordPolicy.MAX_BCRYPT_BYTES || !passwords.matches(value, current.getPassword()))
            throw invalid("현재 비밀번호를 확인해주세요. 이메일 로그인이 없으면 먼저 설정해주세요.");
    }
    private boolean freshSocial(Member member, LocalDateTime at) {
        LocalDateTime now = subjects.now();
        return member.isOAuthUser() && at != null && at.isAfter(now.minusMinutes(5)) && !at.isAfter(now.plusSeconds(60))
                && (member.getOauthSecurityRevokedAt() == null || at.isAfter(member.getOauthSecurityRevokedAt()));
    }
    private void requireFreshSocial(Member member, LocalDateTime at) {
        if (!freshSocial(member, at)) throw new MemberException("연결된 소셜 계정으로 본인 확인을 다시 진행해주세요.", HttpStatus.PRECONDITION_REQUIRED);
    }
    private static AuthProvider providerForEmail(String email) {
        if (email == null) return null;
        String value = email.trim().toLowerCase(Locale.ROOT);
        int at = value.indexOf('@');
        if (at <= 0 || at != value.lastIndexOf('@')) return null;
        return switch (value.substring(at + 1)) {
            case "naver.com" -> AuthProvider.NAVER;
            case "gmail.com" -> AuthProvider.GOOGLE;
            case "kakao.com", "daum.net", "hanmail.net" -> AuthProvider.KAKAO;
            default -> null;
        };
    }
    private static boolean sameLinkEmail(String email, AuthProvider provider, OAuth2UserInfo info) {
        String supplied = info.getEmail();
        if (email == null || supplied == null || !email.trim().equalsIgnoreCase(supplied.trim())) return false;
        Map<String, Object> attributes = info.getAttributes();
        if (provider == AuthProvider.GOOGLE) {
            Object verified = attributes == null ? null : attributes.get("email_verified");
            return Boolean.TRUE.equals(verified) || "true".equals(verified);
        }
        if (provider == AuthProvider.KAKAO) return attributes != null && attributes.get("kakao_account") instanceof Map<?, ?> account
                && Boolean.TRUE.equals(account.get("is_email_valid")) && Boolean.TRUE.equals(account.get("is_email_verified"));
        return provider == AuthProvider.NAVER;
    }
    private static String normalizeEmail(String email) {
        String value = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (value.length() > 254 || !value.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+") || value.endsWith(".local"))
            throw invalid("인증 메일을 받을 수 있는 이메일을 입력해주세요.");
        return value;
    }
    private void requireAvailableEmail(Member current, String email) {
        if (members.findByEmail(email).filter(member -> !member.getId().equals(current.getId())).isPresent())
            throw invalid("이 이메일은 로그인용으로 사용할 수 없어요.");
    }
    private static boolean equal(String a, String b) {
        return a != null && b != null && b.length() <= 256
                && MessageDigest.isEqual(a.getBytes(StandardCharsets.UTF_8), b.getBytes(StandardCharsets.UTF_8));
    }
    private MemberException expired() { return new MemberException("인증 요청이 만료됐어요. 다시 로그인해주세요.", HttpStatus.UNAUTHORIZED); }
    private static MemberException invalid(String message) { return new MemberException(message, HttpStatus.BAD_REQUEST); }
    private OAuth2AuthenticationException oauthExpired() { return new OAuth2AuthenticationException("login_method_expired"); }
    private OAuth2AuthenticationException oauthConflict() { return new OAuth2AuthenticationException("login_method_conflict"); }
}
