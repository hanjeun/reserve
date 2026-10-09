package kr.it.reserve.waiting.service;

import kr.it.reserve.member.event.MemberWithdrawn;
import kr.it.reserve.waiting.entity.WaitingStatus;
import kr.it.reserve.waiting.repository.WaitingEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;

@Component
@RequiredArgsConstructor
public class WaitingAccountCleanup {
    private final WaitingEntryRepository entries;

    @EventListener
    @Transactional(propagation = Propagation.MANDATORY)
    public void withdraw(MemberWithdrawn event) {
        entries.anonymizeMember(event.memberId(), WaitingStatus.ACTIVE, WaitingStatus.CANCELLED,
                LocalDateTime.now(ZoneOffset.UTC));
    }
}
