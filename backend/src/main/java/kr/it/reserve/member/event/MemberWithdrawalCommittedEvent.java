package kr.it.reserve.member.event;

import kr.it.reserve.member.entity.AuthProvider;

/** 커밋 뒤 OAuth 연동 해제에 필요한 메모리 전용 스냅샷. DB나 로그에는 토큰을 남기지 않는다. */
public record MemberWithdrawalCommittedEvent(
        Long memberId,
        AuthProvider provider,
        String oauthAccessToken) {
}
