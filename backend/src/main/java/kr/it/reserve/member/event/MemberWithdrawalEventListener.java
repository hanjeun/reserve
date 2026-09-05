package kr.it.reserve.member.event;

import kr.it.reserve.config.oauth2.OAuthUnlinkService;
import kr.it.reserve.member.entity.Member;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/** DB 탈퇴가 롤백됐는데 외부 연동만 먼저 끊기는 순서 역전을 막기 위해 커밋 후 호출한다. */
@Component
@RequiredArgsConstructor
@Slf4j
public class MemberWithdrawalEventListener {

    private final OAuthUnlinkService oAuthUnlinkService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void unlinkOAuth(MemberWithdrawalCommittedEvent event) {
        if (event.provider() == null) return;

        Member snapshot = Member.builder()
                .id(event.memberId())
                .provider(event.provider())
                .oauthAccessToken(event.oauthAccessToken())
                .build();

        boolean unlinked = oAuthUnlinkService.unlinkOAuth(snapshot);
        if (!unlinked) {
            log.error("OAuth unlink requires manual follow-up: memberId={}, provider={}",
                    event.memberId(), event.provider());
        }
    }
}
