package kr.it.reserve.global.error;

import lombok.Getter;
import org.springframework.http.HttpStatus;

/**
 * 정지/영구정지된 회원의 로그인 시도를 차단할 때 사용.
 * 일반 메시지뿐 아니라 status/until/reason을 구조화된 데이터로 전달하여
 * 프론트엔드가 길이 제한 없이 풍부한 안내 문구를 표시할 수 있도록 한다.
 * (소셜 로그인의 URL 파라미터 방식과 달리, 이메일 로그인은 일반 JSON 응답이라
 *  메시지 길이 제약이 없음 — 이 예외가 그 장점을 활용하는 통로)
 */
@Getter
public class MemberSuspendedException extends BusinessException {

    private final String suspendStatus;   // "SUSPENDED" | "BANNED"
    private final String suspendedUntil;  // ISO date 문자열, BANNED면 null
    private final String reason;          // 정지 사유, 없으면 null

    public MemberSuspendedException(String message, String suspendStatus, String suspendedUntil, String reason) {
        super(message, HttpStatus.FORBIDDEN);
        this.suspendStatus = suspendStatus;
        this.suspendedUntil = suspendedUntil;
        this.reason = reason;
    }
}
