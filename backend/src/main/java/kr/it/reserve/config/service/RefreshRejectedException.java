package kr.it.reserve.config.service;

import kr.it.reserve.global.error.AuthException;
import lombok.Getter;

/**
 * refresh 거절. 응답은 기존과 같은 401 한 가지이고, 사유는 서버 로그에만 남긴다
 * (사유를 응답에 실으면 토큰이 어느 단계에서 막혔는지 밖에서 알 수 있다).
 */
@Getter
public class RefreshRejectedException extends AuthException {

    /** 로그에 {@code reason=}으로 찍히는 값. 이름을 바꾸면 운영 문서(monitoring.md)의 조회 문구도 같이 바꾼다. */
    public enum Reason {
        /** refresh_token 쿠키가 없다. 쿠키 Max-Age가 끝났거나 이미 로그아웃한 브라우저. */
        MISSING_COOKIE,
        /** JWT exp가 지났다. */
        EXPIRED_JWT,
        /** 서명 불일치·형식 오류. */
        INVALID_JWT,
        /** access 토큰을 refresh로 보냈다. */
        NOT_REFRESH_TOKEN,
        /** DB에 없는 토큰. 로그아웃·비밀번호 변경·기기 5개 초과·두 세대 이상 지난 토큰. */
        UNKNOWN_TOKEN,
        /** 유예가 지난 직전 토큰이 다시 왔다. 탈취 재사용으로 보고 그 기기 세션을 끊는다. */
        REUSED_TOKEN,
        /** DB 행의 만료 시각이 지났다. */
        EXPIRED_SESSION,
        /** 비밀번호 변경·재설정 뒤 발급 전 토큰이다. */
        AUTH_VERSION_CHANGED,
        /** 탈퇴 등으로 활성 회원이 아니다. */
        MEMBER_UNAVAILABLE
    }

    private final Reason reason;

    public RefreshRejectedException(Reason reason, String message) {
        super(message);
        this.reason = reason;
    }
}
