package kr.it.reserve.member;

import kr.it.reserve.member.entity.MarketingConsentHistory;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.repository.MarketingConsentHistoryRepository;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.service.MemberService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MarketingConsentHistoryTest {

    @Mock private MemberRepository memberRepository;
    @Mock private MarketingConsentHistoryRepository historyRepository;
    @InjectMocks private MemberService memberService;

    private Member member;

    @BeforeEach
    void setUp() {
        member = Member.builder()
                .id(13L)
                .name("동의 사용자")
                .email("consent@example.com")
                .marketingAgreed(false)
                .build();
        when(memberRepository.findActiveByIdForUpdate(13L)).thenReturn(Optional.of(member));
    }

    @Test
    void recordsASettingsTransitionWithPolicyVersion() {
        when(memberRepository.save(member)).thenReturn(member);

        memberService.updateMarketingConsent(13L, true);

        ArgumentCaptor<MarketingConsentHistory> captor = ArgumentCaptor.forClass(MarketingConsentHistory.class);
        verify(historyRepository).save(captor.capture());
        assertThat(captor.getValue().isAgreed()).isTrue();
        assertThat(captor.getValue().getSource()).isEqualTo(MarketingConsentHistory.Source.SETTINGS);
        assertThat(captor.getValue().getPolicyVersion())
                .isEqualTo(MarketingConsentHistory.CURRENT_POLICY_VERSION);
    }

    @Test
    void repeatedIdenticalRequestsDoNotSpamTheHistory() {
        memberService.updateMarketingConsent(13L, false);

        verify(historyRepository, never()).save(org.mockito.ArgumentMatchers.any());
        verify(memberRepository, never()).save(member);
    }
}
