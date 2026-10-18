package kr.it.reserve.config.oauth2.events;

import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurity;
import kr.it.reserve.config.oauth2.subject.OAuthSubjectSecurityService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Map;
import java.util.TreeMap;
import java.util.LinkedHashMap;

/** inbox 수신과 자체 자격 증명 폐기를 한 트랜잭션으로 커밋한다. 거래·회원 삭제는 하지 않는다. */
@Service
@RequiredArgsConstructor
public class OAuthSecurityEventTransaction {
    private final OAuthSecurityEventRepository events;
    private final MemberRepository members;
    private final RefreshTokenRepository refreshTokens;
    private final OAuthSubjectSecurityService subjectSecurity;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void process(VerifiedOAuthSecurityEvent event, String eventHash) {
        Map<String, VerifiedOAuthSecurityEvent.Action> orderedActions = new TreeMap<>();
        for (VerifiedOAuthSecurityEvent.Action action : event.actions()) {
            orderedActions.merge(OAuthSubjectSecurityService.subjectKey(event.provider(), action.providerId()), action,
                    (first, next) -> new VerifiedOAuthSecurityEvent.Action(first.providerId(),
                            first.clearProviderToken() || next.clearProviderToken()));
        }
        Map<String, OAuthSubjectSecurity> lockedSubjects = new LinkedHashMap<>();
        // 모든 주체를 일정 순서로 잠근 뒤에만 inbox/회원의 current read로 들어간다.
        for (var entry : orderedActions.entrySet()) {
            lockedSubjects.put(entry.getKey(), subjectSecurity.lock(event.provider(), entry.getValue().providerId()));
        }
        if (events.existsByEventHash(eventHash)) return;
        LocalDateTime occurredAt = LocalDateTime.ofInstant(event.occurredAt(), ZoneOffset.UTC);
        OAuthSecurityEventRecord record = events.saveAndFlush(OAuthSecurityEventRecord.received(
                event.provider(), eventHash, occurredAt, LocalDateTime.now(Clock.systemUTC())));
        for (VerifiedOAuthSecurityEvent.Action action : orderedActions.values()) {
            OAuthSubjectSecurity subject = lockedSubjects.get(OAuthSubjectSecurityService.subjectKey(event.provider(), action.providerId()));
            var matchingMembers = new ArrayList<Member>();
            for (Long memberId : members.findActiveIdsByProviderAndProviderIdForUpdate(event.provider().name(), action.providerId())) {
                Member member = members.findActiveByIdForUpdate(memberId).orElse(null);
                if (member == null || member.getProvider() != event.provider()
                        || !action.providerId().equals(member.getProviderId())) continue;
                subject.mergeMemberState(member.getOauthAuthenticatedAt(), member.getOauthSecurityRevokedAt());
                matchingMembers.add(member);
            }
            // 회원 INSERT 전에도 cutoff가 커밋되어 사건 이전에 교환한 토큰의 가입을 막는다.
            // 지연 사건도 이전 원인증의 앱 토큰 가족을 폐기한다. 최신 공급자 연결은 아래에서 보존한다.
            subject.revoked(occurredAt, subjectSecurity.now());
            record.markApplied();
            for (Member member : matchingMembers) {
                member.recordOAuthSecurityRevocation(occurredAt);
                if (member.getOauthAuthenticatedAt() != null && occurredAt.isBefore(member.getOauthAuthenticatedAt())) {
                    continue;
                }
                member.rotateAuthVersion();
                refreshTokens.deleteByMemberId(member.getId());
                if (action.clearProviderToken()) member.setOauthAccessToken(null);
                record.markApplied();
            }
        }
    }
}
