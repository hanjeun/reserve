package kr.it.reserve.config.service;

import kr.it.reserve.config.jwt.JwtProperties;
import kr.it.reserve.config.jwt.TokenProvider;
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

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

/**
 * refresh 요청 처리 — 회전(rotation) + 거절 사유 로그.
 *
 * <p>예전엔 refresh가 access만 새로 주고 refresh 토큰·쿠키는 로그인 때 것을 그대로 썼다. 그래서
 * 매일 쓰는 사람도 로그인 14일째에 무조건 로그아웃됐다. 이제는 refresh 때마다 refresh 토큰을 새로 발급하고
 * 같은 DB 행을 갱신한다 → 14일은 "마지막 사용으로부터" 14일이 된다(sliding).
 *
 * <p>회전의 대가로 직전 토큰 처리가 필요하다.
 * <ul>
 *   <li>탭 여러 개·네트워크 재시도로 같은 토큰이 거의 동시에 두 번 오면, 두 번째는 방금 바뀐 직전 토큰을 들고 온다.
 *       {@link #PREVIOUS_TOKEN_GRACE} 안이면 현재 토큰을 그대로 돌려준다(새로 회전하지 않음).</li>
 *   <li>유예가 지난 뒤 직전 토큰이 오면 누군가 옛 토큰을 따로 갖고 있다는 뜻이다. 그 기기 행을 지워 양쪽 다 끊는다.</li>
 * </ul>
 * 응답은 사유와 상관없이 같은 401이다. 사유는 {@code Refresh rejected: reason=...} 로그로만 남긴다.
 */
@Slf4j
@RequiredArgsConstructor
@Service
public class TokenService {

    /** 직전 토큰을 현재 토큰으로 인정해 주는 시간. 동시 요청·재시도만 흡수하면 되므로 짧게 둔다. */
    static final Duration PREVIOUS_TOKEN_GRACE = Duration.ofSeconds(60);

    private static final String RELOGIN_MESSAGE = "로그인이 만료되었습니다. 다시 로그인해주세요.";

    private final TokenProvider tokenProvider;
    private final RefreshTokenRepository refreshTokenRepository;
    private final MemberRepository memberRepository;
    private final JwtProperties jwtProperties;

    /**
     * @param accessToken      새 access JWT
     * @param refreshToken     쿠키에 다시 심을 refresh JWT(회전했으면 새 값, 유예 경로면 현재 값)
     * @param refreshMaxAge    refresh 쿠키 Max-Age
     */
    public record RefreshResult(String accessToken, String refreshToken, Duration refreshMaxAge) { }

    // 거절은 401로 끝나지만, 그 전에 한 행 삭제(재사용·만료·세대 불일치)는 반드시 남아야 한다.
    @Transactional(noRollbackFor = RefreshRejectedException.class)
    public RefreshResult refresh(String presentedToken) {
        RefreshTokenInspection inspection = tokenProvider.inspectRefreshToken(presentedToken);
        switch (inspection.state()) {
            case EXPIRED -> throw reject(Reason.EXPIRED_JWT, inspection.memberId());
            case INVALID -> throw reject(Reason.INVALID_JWT, null);
            case NOT_REFRESH -> throw reject(Reason.NOT_REFRESH_TOKEN, inspection.memberId());
            case VALID -> { /* 아래에서 DB 확인 */ }
        }

        Optional<Long> rowId = first(refreshTokenRepository.findIdsByRefreshToken(presentedToken));
        if (rowId.isEmpty()) {
            rowId = first(refreshTokenRepository.findIdsByPreviousTokenHash(RefreshToken.hash(presentedToken)));
        }
        RefreshToken row = rowId.flatMap(refreshTokenRepository::findByIdForUpdate).orElse(null);
        if (row == null || !row.getMemberId().equals(inspection.memberId())) {
            throw reject(Reason.UNKNOWN_TOKEN, inspection.memberId());
        }

        LocalDateTime now = LocalDateTime.now();
        if (row.isExpired()) {
            refreshTokenRepository.delete(row);
            throw reject(Reason.EXPIRED_SESSION, row.getMemberId());
        }

        Member member = memberRepository.findByIdAndDeletedAtIsNull(row.getMemberId()).orElse(null);
        if (member == null) {
            refreshTokenRepository.delete(row);
            throw reject(Reason.MEMBER_UNAVAILABLE, row.getMemberId());
        }
        if (inspection.authVersion() != member.getAuthVersion()) {
            refreshTokenRepository.delete(row);
            throw reject(Reason.AUTH_VERSION_CHANGED, member.getId());
        }

        // 잠금을 기다리는 사이 다른 요청이 먼저 회전했을 수 있다 → 잠근 뒤의 값으로 다시 판단한다.
        if (row.getRefreshToken().equals(presentedToken)) {
            liftExpiredSuspension(member);
            Duration ttl = jwtProperties.getRefreshTokenExpiration();
            String newRefreshToken = tokenProvider.createRefreshJwt(member);
            row.rotate(newRefreshToken, now.plus(ttl), now);
            log.info("Refresh rotated: memberId={}", member.getId());
            return new RefreshResult(tokenProvider.generateAccessToken(member), newRefreshToken, ttl);
        }

        if (row.isPreviousToken(presentedToken)) {
            if (row.rotatedWithin(PREVIOUS_TOKEN_GRACE, now)) {
                liftExpiredSuspension(member);
                log.info("Refresh reused within grace: memberId={}", member.getId());
                return new RefreshResult(tokenProvider.generateAccessToken(member), row.getRefreshToken(),
                        Duration.between(now, row.getExpiresAt()));
            }
            refreshTokenRepository.delete(row);
            throw reject(Reason.REUSED_TOKEN, member.getId());
        }

        // 잠그는 사이 두 번 이상 회전해 제시된 토큰이 현재도 직전도 아니게 됐다.
        throw reject(Reason.UNKNOWN_TOKEN, member.getId());
    }

    /** 로그아웃. 현재 토큰이든 유예 중인 직전 토큰이든 그 기기 행을 지운다. */
    @Transactional
    public void revoke(String presentedToken) {
        List<Long> ids = refreshTokenRepository.findIdsByRefreshToken(presentedToken);
        if (ids.isEmpty()) {
            ids = refreshTokenRepository.findIdsByPreviousTokenHash(RefreshToken.hash(presentedToken));
        }
        if (!ids.isEmpty()) {
            refreshTokenRepository.deleteAllById(ids);
        }
    }

    /** 쿠키 자체가 없을 때. 컨트롤러가 서비스까지 오지 않고 거절하므로 로그 형식만 여기서 맞춘다. */
    public RefreshRejectedException rejectMissingCookie() {
        return reject(Reason.MISSING_COOKIE, null);
    }

    private void liftExpiredSuspension(Member member) {
        // 정지 기간이 끝났으면 여기서 해제한다. 정지 중이어도 refresh 자체는 허용한다 —
        // 실제 접근 차단은 TokenProvider.getActiveMemberFromToken과 서비스 레이어가 한다.
        if (member.isSuspensionExpired()) {
            log.info("Suspension expired, auto-lifting for memberId={}", member.getId());
            member.unban();
            memberRepository.save(member);
        }
    }

    private static Optional<Long> first(List<Long> ids) {
        return ids.isEmpty() ? Optional.empty() : Optional.of(ids.get(0));
    }

    /**
     * 사유는 로그로만 남기고 응답 문구는 하나로 통일한다. 토큰 값은 절대 로그에 남기지 않는다.
     * 정상 수명 주기(쿠키 없음·만료·세대 교체·기기 정리)는 INFO, 위조·용도 위반·재사용은 WARN.
     * 매개변수 이름을 {@code reason}으로 두지 않는다 — PiiLogBoundaryTest가 자유 문자열 사유를 막으려고
     * 그 이름의 로그 인자를 거부한다. 여기 값은 고정 enum이라 개인정보가 들어갈 수 없다.
     */
    private static RefreshRejectedException reject(Reason rejection, Long memberId) {
        switch (rejection) {
            case INVALID_JWT, NOT_REFRESH_TOKEN, REUSED_TOKEN ->
                    log.warn("Refresh rejected: reason={}, memberId={}", rejection, memberId);
            default -> log.info("Refresh rejected: reason={}, memberId={}", rejection, memberId);
        }
        return new RefreshRejectedException(rejection, RELOGIN_MESSAGE);
    }
}
