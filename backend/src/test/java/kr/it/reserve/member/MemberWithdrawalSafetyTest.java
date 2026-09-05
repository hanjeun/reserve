package kr.it.reserve.member;

import kr.it.reserve.business.entity.BusinessVerification;
import kr.it.reserve.business.repository.BusinessVerificationRepository;
import kr.it.reserve.community.repository.CommunityCommentRepository;
import kr.it.reserve.community.repository.CommunityPostRepository;
import kr.it.reserve.community.repository.PostLikeRepository;
import kr.it.reserve.config.jwt.repository.RefreshTokenRepository;
import kr.it.reserve.email.repository.EmailVerificationRepository;
import kr.it.reserve.email.service.EmailVerificationService;
import kr.it.reserve.favorite.repository.FavoriteRepository;
import kr.it.reserve.file.service.FileDeletionOutboxService;
import kr.it.reserve.file.service.FileStorageService;
import kr.it.reserve.global.security.PwnedPasswordChecker;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import kr.it.reserve.member.entity.AuthProvider;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.event.MemberWithdrawalCommittedEvent;
import kr.it.reserve.member.repository.MemberRepository;
import kr.it.reserve.member.repository.PasswordResetTokenRepository;
import kr.it.reserve.member.service.MemberService;
import kr.it.reserve.promotion.repository.PromotionRepository;
import kr.it.reserve.payment.repository.PaymentRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MemberWithdrawalSafetyTest {

    @Mock private MemberRepository memberRepository;
    @Mock private RefreshTokenRepository refreshTokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private EmailVerificationService emailVerificationService;
    @Mock private FavoriteRepository favoriteRepository;
    @Mock private PromotionRepository promotionRepository;
    @Mock private PaymentRepository paymentRepository;
    @Mock private ReservationRepository reservationRepository;
    @Mock private CommunityPostRepository communityPostRepository;
    @Mock private CommunityCommentRepository communityCommentRepository;
    @Mock private PostLikeRepository postLikeRepository;
    @Mock private FileStorageService fileStorageService;
    @Mock private FileDeletionOutboxService fileDeletionOutboxService;
    @Mock private BusinessVerificationRepository businessVerificationRepository;
    @Mock private PasswordResetTokenRepository passwordResetTokenRepository;
    @Mock private EmailVerificationRepository emailVerificationRepository;
    @Mock private DataLifecycleGuard dataLifecycleGuard;
    @Mock private ApplicationEventPublisher eventPublisher;
    @Mock private PwnedPasswordChecker pwnedPasswordChecker;

    @InjectMocks private MemberService memberService;

    @Test
    @DisplayName("탈퇴는 회원·거래 행을 삭제하지 않고 식별자를 제거하며 파일을 삭제함에 넣는다")
    void withdrawalAnonymizesInsteadOfDeletingLedgerIdentity() {
        long memberId = 7L;
        Member member = Member.builder()
                .id(memberId)
                .name("실명")
                .email("person@example.com")
                .password("encoded")
                .provider(AuthProvider.GOOGLE)
                .providerId("provider-user-id")
                .oauthAccessToken("secret-token")
                .profileImage("https://cdn.example/users/7/profile.png")
                .marketingAgreed(true)
                .termsAgreed(true)
                .build();
        BusinessVerification verification = BusinessVerification.builder()
                .id(3L)
                .member(member)
                .licenseImageKey("users/7/business/license.png")
                .businessName("가게")
                .build();

        when(memberRepository.findActiveByIdForUpdate(memberId)).thenReturn(Optional.of(member));
        when(businessVerificationRepository.findByMemberOrderByCreatedAtDesc(member))
                .thenReturn(List.of(verification));
        when(communityPostRepository.findPostIdsByAuthorId(memberId)).thenReturn(List.of());

        memberService.deleteMember(memberId);

        verify(dataLifecycleGuard).requireMemberWithdrawalAllowed(memberId);
        verify(fileDeletionOutboxService).enqueue(
                "https://cdn.example/users/7/profile.png", "MEMBER_PROFILE_IMAGE", memberId);
        verify(fileDeletionOutboxService).enqueue(
                "users/7/business/license.png", "BUSINESS_LICENSE_IMAGE", 3L);
        verify(refreshTokenRepository).deleteByMemberId(memberId);
        verify(paymentRepository).anonymizeBuyerByMemberId(memberId);
        verify(reservationRepository).clearSpecialRequestsByMemberId(memberId);
        verify(passwordResetTokenRepository).deleteByEmail("person@example.com");
        verify(emailVerificationRepository).deleteByEmail("person@example.com");
        verify(eventPublisher).publishEvent(any(MemberWithdrawalCommittedEvent.class));
        verify(memberRepository, never()).deleteById(memberId);

        assertThat(member.isDeleted()).isTrue();
        assertThat(member.getName()).isEqualTo("탈퇴한 회원");
        assertThat(member.getEmail()).isEqualTo("withdrawn-7@reserve.invalid");
        assertThat(member.getPassword()).isNull();
        assertThat(member.getProvider()).isNull();
        assertThat(member.getOauthAccessToken()).isNull();
        assertThat(member.isMarketingAgreed()).isFalse();
    }
}
