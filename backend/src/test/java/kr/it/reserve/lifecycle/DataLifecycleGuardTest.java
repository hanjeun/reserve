package kr.it.reserve.lifecycle;

import kr.it.reserve.advertisement.repository.AdvertisementRepository;
import kr.it.reserve.global.error.MemberException;
import kr.it.reserve.global.error.StoreException;
import kr.it.reserve.lifecycle.dto.MemberWithdrawalReadiness;
import kr.it.reserve.lifecycle.dto.StoreClosureReadiness;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import kr.it.reserve.payment.repository.PaymentReconciliationIssueRepository;
import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.repository.RefundAttemptRepository;
import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.store.repository.StoreRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DataLifecycleGuardTest {

    @Mock private StoreRepository storeRepository;
    @Mock private ReservationRepository reservationRepository;
    @Mock private AdvertisementRepository advertisementRepository;
    @Mock private RefundAttemptRepository refundAttemptRepository;
    @Mock private PaymentReconciliationIssueRepository issueRepository;
    @Mock private PaymentWebhookInboxRepository webhookInboxRepository;

    @InjectMocks private DataLifecycleGuard guard;

    @Test
    @DisplayName("가게 폐업 준비도는 예약·광고·환불·대사·웹훅을 한 관문에서 합산한다")
    void storeClosureAggregatesEveryOperationalBlocker() {
        long storeId = 10L;
        when(reservationRepository.countLifecycleBlockingByStoreId(storeId)).thenReturn(2);
        when(advertisementRepository.countByStoreIdAndStatusInAndDeletedAtIsNull(eq(storeId), any()))
                .thenReturn(1L);
        when(refundAttemptRepository.countUnresolvedByStoreId(eq(storeId), any())).thenReturn(3L);
        when(issueRepository.countOpenByStoreId(eq(storeId), any())).thenReturn(4L);
        when(webhookInboxRepository.countUnfinishedByStoreId(eq(storeId), any())).thenReturn(5L);

        StoreClosureReadiness result = guard.inspectStore(storeId);

        assertThat(result.canClose()).isFalse();
        assertThat(result.unresolvedReservations()).isEqualTo(2);
        assertThat(result.activeAdvertisements()).isEqualTo(1);
        assertThat(result.unresolvedRefunds()).isEqualTo(3);
        assertThatThrownBy(() -> guard.requireStoreClosureAllowed(storeId))
                .isInstanceOf(StoreException.class)
                .hasMessageContaining("예약 2건")
                .hasMessageContaining("웹훅 5건");
    }

    @Test
    @DisplayName("회원 탈퇴는 운영 중 가게나 금전 미결 건이 있으면 차단한다")
    void memberWithdrawalFailsClosed() {
        long memberId = 20L;
        when(storeRepository.countByOwnerIdAndDeletedAtIsNull(memberId)).thenReturn(1L);
        when(reservationRepository.countLifecycleBlockingByMemberId(memberId)).thenReturn(0);
        when(refundAttemptRepository.countUnresolvedByMemberId(eq(memberId), any())).thenReturn(0L);
        when(issueRepository.countOpenByMemberId(eq(memberId), any())).thenReturn(1L);
        when(webhookInboxRepository.countUnfinishedByMemberId(eq(memberId), any())).thenReturn(0L);

        MemberWithdrawalReadiness result = guard.inspectMember(memberId);

        assertThat(result.canWithdraw()).isFalse();
        assertThatThrownBy(() -> guard.requireMemberWithdrawalAllowed(memberId))
                .isInstanceOf(MemberException.class)
                .hasMessageContaining("운영 중 가게 1곳")
                .hasMessageContaining("결제 확인 1건");
    }
}
