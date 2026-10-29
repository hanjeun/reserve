package kr.it.reserve.config.service;

import io.jsonwebtoken.JwtException;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import kr.it.reserve.config.jwt.TokenProvider;
import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider.RefreshTokenInspection;
import kr.it.reserve.config.jwt.entity.RefreshToken;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.config.service.RefreshRejectedException.Reason;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Objects;

/** 모든 변경은 회원→기기 세션 순서로 잠근다. */
@Slf4j
@RequiredArgsConstructor
@Service
public class TokenService {
    static final Duration PREVIOUS_TOKEN_GRACE = Duration.ofSeconds(60);
    private static final String RELOGIN_MESSAGE = "로그인이 만료됐어요. 다시 로그인해주세요.";
    private final TokenProvider tokenProvider;
    private final RefreshTokenRepository refreshTokenRepository;
    private final MemberRepository memberRepository;
    private final JwtProperties jwtProperties;
    @PersistenceContext private EntityManager entityManager;
    private Clock clock = Clock.systemUTC();

    public record RefreshResult(String accessToken, String refreshToken, Duration refreshMaxAge, boolean persistent) {
        public RefreshResult(String access, String refresh, Duration maxAge) { this(access, refresh, maxAge, true); }
        @Override public String toString() { return "RefreshResult[credentials=redacted]"; }
    }

    @Transactional(noRollbackFor = RefreshRejectedException.class)
    public RefreshResult refresh(String presentedToken) {
        RefreshTokenInspection proof = tokenProvider.inspectRefreshToken(presentedToken);
        switch (proof.state()) {
            case INVALID -> throw reject(Reason.INVALID_JWT, null);
            case NOT_REFRESH -> throw reject(Reason.NOT_REFRESH_TOKEN, proof.memberId());
            case LEGACY -> throw reject(Reason.LEGACY_SESSION, proof.memberId());
            case VALID, EXPIRED -> { /* 서명이 유효한 만료 토큰도 재사용된 리프레시 계열 식별에는 사용할 수 있다. */ }
        }
        Member member = memberRepository.findActiveByIdForUpdate(proof.memberId()).orElse(null);
        entityManager.flush();
        if (member != null) entityManager.refresh(member, LockModeType.PESSIMISTIC_WRITE);
        RefreshToken row = refreshTokenRepository.findBySessionIdForUpdate(proof.sessionId(), proof.memberId()).orElse(null);
        if (row == null) throw reject(Reason.UNKNOWN_TOKEN, proof.memberId());
        entityManager.refresh(row, LockModeType.PESSIMISTIC_WRITE);
        if (!contextMatches(row, proof)) throw reject(Reason.INVALID_JWT, proof.memberId());
        if (member == null || member.isDeleted()) return removeAndReject(row, Reason.MEMBER_UNAVAILABLE);
        if (proof.authVersion() != member.getAuthVersion()) return removeAndReject(row, Reason.AUTH_VERSION_CHANGED);
        if (!tokenProvider.isLoginSessionCurrent(member, proof.oauthAuthenticatedAt(), proof.loginMethod())) {
            return removeAndReject(row, Reason.OAUTH_AUTHENTICATION_REVOKED);
        }
        LocalDateTime now = LocalDateTime.now(clock);
        if (!row.isLiveAt(now)) return removeAndReject(row, Reason.EXPIRED_SESSION);

        long generation = proof.rotationVersion();
        long currentGeneration = row.getRotationVersion();
        if (generation < currentGeneration - 1) return removeAndReject(row, Reason.REUSED_TOKEN);
        if (generation == currentGeneration - 1) {
            if (!row.isPreviousToken(presentedToken)) throw reject(Reason.INVALID_JWT, proof.memberId());
            if (!row.rotatedWithin(PREVIOUS_TOKEN_GRACE, now)) return removeAndReject(row, Reason.REUSED_TOKEN);
            if (proof.state() == TokenProvider.RefreshTokenState.EXPIRED) throw reject(Reason.EXPIRED_JWT, proof.memberId());
            liftExpiredSuspension(member);
            try { return result(tokenProvider.currentSessionTokens(row, proof.persistence())); }
            catch (JwtException inconsistent) { return removeAndReject(row, Reason.SESSION_INCONSISTENT); }
        }
        if (generation != currentGeneration || !row.isCurrentToken(presentedToken)
                || !Objects.equals(proof.jti(), row.getRefreshJti())) throw reject(Reason.UNKNOWN_TOKEN, proof.memberId());
        if (proof.state() == TokenProvider.RefreshTokenState.EXPIRED) return removeAndReject(row, Reason.EXPIRED_JWT);
        liftExpiredSuspension(member);
        return result(tokenProvider.rotateSession(row, proof.persistence()));
    }

    /** 회전 뒤 늦게 도착한 로그아웃도 검증된 세션 식별자로 해당 기기만 폐기한다. */
    @Transactional
    public void revoke(String presentedToken) {
        RefreshTokenInspection proof = tokenProvider.inspectRefreshToken(presentedToken);
        if (proof.state() != TokenProvider.RefreshTokenState.VALID && proof.state() != TokenProvider.RefreshTokenState.EXPIRED) return;
        memberRepository.findActiveByIdForUpdate(proof.memberId());
        entityManager.flush();
        RefreshToken row = refreshTokenRepository.findBySessionIdForUpdate(proof.sessionId(), proof.memberId()).orElse(null);
        if (row != null) {
            entityManager.refresh(row, LockModeType.PESSIMISTIC_WRITE);
            if (contextMatches(row, proof) && proof.rotationVersion() <= row.getRotationVersion()) refreshTokenRepository.delete(row);
        }
    }

    public RefreshRejectedException rejectMissingCookie() { return reject(Reason.MISSING_COOKIE, null); }
    private static boolean contextMatches(RefreshToken row, RefreshTokenInspection proof) {
        return Objects.equals(row.getMemberId(), proof.memberId()) && Objects.equals(row.getSessionId(), proof.sessionId())
                && row.getAuthVersion() == proof.authVersion() && Objects.equals(row.getLoginMethod(), proof.loginMethod())
                && Objects.equals(row.getOauthAuthenticatedAt(), proof.oauthAuthenticatedAt())
                && Objects.equals(row.getAbsoluteExpiresAt(), proof.absoluteExpiresAt());
    }
    private RefreshResult removeAndReject(RefreshToken row, Reason reason) {
        refreshTokenRepository.delete(row);
        throw reject(reason, row.getMemberId());
    }
    private static RefreshResult result(TokenProvider.IssuedSession pair) {
        return new RefreshResult(pair.accessToken(), pair.refreshToken(), pair.refreshMaxAge(), pair.persistent());
    }
    private void liftExpiredSuspension(Member member) {
        // 정지 중에도 세션은 유지할 수 있지만 액세스 인증은 정지를 거부한다.
        if (member.isSuspensionExpired()) {
            member.unban();
            memberRepository.save(member);
        }
    }
    private static RefreshRejectedException reject(Reason rejection, Long memberId) {
        switch (rejection) {
            case INVALID_JWT, NOT_REFRESH_TOKEN, REUSED_TOKEN, SESSION_INCONSISTENT ->
                    log.warn("Refresh rejected: reason={}, memberId={}", rejection, memberId);
            default -> log.info("Refresh rejected: reason={}, memberId={}", rejection, memberId);
        }
        return new RefreshRejectedException(rejection,
                rejection == Reason.LEGACY_SESSION ? TokenProvider.RELOGIN_AFTER_UPDATE : RELOGIN_MESSAGE);
    }
}
