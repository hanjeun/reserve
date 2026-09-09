package kr.it.reserve.advertisement.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import kr.it.reserve.advertisement.entity.*;
import kr.it.reserve.advertisement.repository.*;
import kr.it.reserve.global.common.ServiceTime;
import kr.it.reserve.global.error.AdvertisementException;
import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.lifecycle.service.DataLifecycleGuard;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.member.entity.Role;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.dto.PortoneV2CancelResponse;
import kr.it.reserve.payment.service.PaymentStatusService;
import kr.it.reserve.payment.service.PortoneService;
import kr.it.reserve.payment.service.PortoneWebhookService;
import kr.it.reserve.store.entity.Store;
import org.junit.jupiter.api.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 실제 커밋 경계를 쓰는 H2 통합 검사. 외부 PG는 전부 mock이며 실결제/운영 데이터는 사용하지 않는다. */
@SpringBootTest
class AdPaymentLifecycleTest {
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager transactionManager;
    @Autowired AdPaymentService payments;
    @Autowired AdPaymentLedgerService ledger;
    @Autowired AdPaymentAttemptRepository attempts;
    @Autowired AdvertisementRepository ads;
    @Autowired DataLifecycleGuard lifecycle;
    @Autowired PaymentStatusService statusService;
    @Autowired PortoneWebhookService webhooks;
    @Autowired ObjectMapper json;
    @Autowired kr.it.reserve.store.service.StoreService storeService;
    @MockitoBean PortoneService pg;
    private TransactionTemplate tx;
    private Long adId;
    private Long ownerId;
    private Long storeId;
    private String uid;

    @BeforeEach
    void fixture() {
        tx = new TransactionTemplate(transactionManager);
        tx.executeWithoutResult(ignored -> {
            Member owner = Member.builder().name("검증용").email(UUID.randomUUID() + "@example.test").role(Role.BUSINESS).build();
            em.persist(owner);
            Store store = Store.builder().name("광고 검증").owner(owner).build();
            em.persist(store);
            Advertisement ad = Advertisement.builder().store(store).adType(AdType.BADGE).amount(1000)
                    .merchantUid("AD-" + UUID.randomUUID()).startDate(ServiceTime.today().plusDays(1))
                    .endDate(ServiceTime.today().plusDays(2)).build();
            em.persist(ad);
            adId = ad.getId(); ownerId = owner.getId(); storeId = store.getId(); uid = ad.getMerchantUid();
            ledger.registerNew(ad);
        });
        when(pg.getStoreId()).thenReturn("test-store");
    }

    private PortoneV2PaymentResponse payment(String id, String state, long cancelled) throws Exception {
        return json.readValue("{\"id\":\"" + id + "\",\"status\":\"" + state
                + "\",\"currency\":\"KRW\",\"amount\":{\"total\":1000,\"cancelled\":" + cancelled + "}}",
                PortoneV2PaymentResponse.class);
    }
    private void reports(String state, long cancelled) throws Exception {
        var result = payment(uid, state, cancelled);
        when(pg.getPaymentInfo(uid)).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            return result;
        });
    }
    private AdPaymentAttempt attempt() { return attempts.findByMerchantUid(uid).orElseThrow(); }
    private AdStatus adStatus() { return ads.findById(adId).orElseThrow().getStatus(); }

    @Test void readyReuseAndFailedRetryKeepEveryIssuedUid() throws Exception {
        reports("READY", 0);
        assertThat(payments.prepare(adId, ownerId).getMerchantUid()).isEqualTo(uid);
        assertThat(payments.prepare(adId, ownerId).getMerchantUid()).isEqualTo(uid);
        reports("FAILED", 0);
        String nextUid = payments.prepare(adId, ownerId).getMerchantUid();
        assertThat(nextUid).isNotEqualTo(uid);
        assertThat(attempts.findByAdIdOrderByIdAsc(adId)).hasSize(2);
        assertThat(attempt().getState()).isEqualTo(AdPaymentAttempt.State.FAILED);
        // 이전 UID의 늦은 PAID는 새 광고 활성화가 아니라 대사 사유가 된다.
        reports("PAID", 0);
        assertThatThrownBy(() -> payments.verify(uid, ownerId)).isInstanceOf(AdvertisementException.class);
        assertThat(attempt().getIssueCode()).isEqualTo("PAID_WITHOUT_DELIVERABLE_AD");
        assertThat(adStatus()).isEqualTo(AdStatus.PENDING_PAYMENT);
        assertThat(statusService.getStatus("ad", uid, ownerId).status()).isEqualTo("REVIEW_REQUIRED");
        assertThat(lifecycle.inspectStore(storeId).canClose()).isFalse();
    }

    @Test void unknownOrUnavailableDoesNotRotateTheUid() {
        when(pg.getPaymentInfo(uid)).thenThrow(new PaymentException("test", HttpStatus.NOT_FOUND));
        assertThat(payments.prepare(adId, ownerId).getMerchantUid()).isEqualTo(uid);
        assertThat(attempt().getState()).isEqualTo(AdPaymentAttempt.State.REVIEW_REQUIRED);
        doThrow(new PaymentException("test", HttpStatus.INTERNAL_SERVER_ERROR)).when(pg).getPaymentInfo(uid);
        assertThatThrownBy(() -> payments.prepare(adId, ownerId)).isInstanceOf(AdvertisementException.class);
        assertThat(attempts.findByAdIdOrderByIdAsc(adId)).hasSize(1);
    }

    @Test void ownerCheckPrecedesPgAndOldOrMissingOrdersDoNotLeak() {
        assertThatThrownBy(() -> payments.verify(uid, ownerId + 100000)).isInstanceOf(AdvertisementException.class);
        assertThatThrownBy(() -> statusService.getStatus("ad", uid, ownerId + 100000)).isInstanceOf(PaymentException.class);
        verify(pg, never()).getPaymentInfo(anyString());
    }

    @Test void duplicatePaidCallbacksAreIdempotentAndKnownWebhookRoutesToAds() throws Exception {
        reports("PAID", 0);
        assertThat(webhooks.processMerchantUid(uid)).isEqualTo(PortoneWebhookService.ProcessingResult.PROCESSED);
        assertThat(payments.verify(uid, ownerId).getStatus()).isEqualTo("ACTIVE");
        assertThat(payments.verify(uid, ownerId).getStatus()).isEqualTo("ACTIVE");
        assertThat(attempts.findByAdIdOrderByIdAsc(adId)).hasSize(1);
        verify(pg, never()).cancelPayment(anyString(), any(), anyString(), anyString());
    }

    @ParameterizedTest
    @ValueSource(strings = {"USD", "AMOUNT"})
    void currencyAndAmountMismatchNeverActivateOrRefund(String mismatch) throws Exception {
        String currency = "USD".equals(mismatch) ? "USD" : "KRW";
        int amount = "AMOUNT".equals(mismatch) ? 999 : 1000;
        var result = json.readValue("{\"id\":\"" + uid + "\",\"status\":\"PAID\",\"currency\":\""
                + currency + "\",\"amount\":{\"total\":" + amount + ",\"cancelled\":0}}", PortoneV2PaymentResponse.class);
        when(pg.getPaymentInfo(uid)).thenReturn(result);
        assertThatThrownBy(() -> payments.verify(uid, ownerId)).isInstanceOf(AdvertisementException.class);
        assertThat(attempt().getIssueCode()).isEqualTo("PAYMENT_ID_CURRENCY_AMOUNT_MISMATCH");
        assertThat(adStatus()).isEqualTo(AdStatus.REVIEW_REQUIRED);
        verify(pg, never()).cancelPayment(anyString(), any(), anyString(), anyString());
    }

    @Test void updatingAnAlreadyClosedStoreCannotRestoreItsPreviousState() {
        tx.executeWithoutResult(ignored -> em.find(Store.class, storeId).softDelete());
        Member owner = tx.execute(ignored -> em.find(Member.class, ownerId));
        var request = new kr.it.reserve.store.dto.StoreUpdateRequest();
        request.setName("should not be stored");
        assertThatThrownBy(() -> storeService.updateStore(storeId, request, owner))
                .isInstanceOf(kr.it.reserve.global.error.StoreException.class);
        Boolean deleted = tx.execute(ignored -> em.find(Store.class, storeId).isDeleted());
        assertThat(deleted).isTrue();
    }

    @Test void failedHttpResponseCannotRollBackTheDurableMismatchRecord() throws Exception {
        when(pg.getPaymentInfo(uid)).thenReturn(payment("AD-another-order", "PAID", 0));
        assertThatThrownBy(() -> payments.verify(uid, ownerId)).isInstanceOf(AdvertisementException.class);
        assertThat(attempt().getIssueCode()).isEqualTo("PAYMENT_ID_CURRENCY_AMOUNT_MISMATCH");
        assertThat(adStatus()).isEqualTo(AdStatus.REVIEW_REQUIRED);
    }

    @Test void closureOrSuspensionDuringPgCallCannotResurrectAnAd() throws Exception {
        var paid = payment(uid, "PAID", 0);
        when(pg.getPaymentInfo(uid)).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            tx.executeWithoutResult(ignored -> em.find(Store.class, storeId).ban("test"));
            return paid;
        });
        assertThatThrownBy(() -> payments.verify(uid, ownerId)).isInstanceOf(AdvertisementException.class);
        assertThat(adStatus()).isEqualTo(AdStatus.REVIEW_REQUIRED);
        assertThat(attempt().getIssueCode()).isEqualTo("PAID_WITHOUT_DELIVERABLE_AD");
    }

    @ParameterizedTest @ValueSource(strings = {"REQUESTED", "SUCCEEDED", "FAILED", "UNKNOWN"})
    void cancellationResponseIsNotProofAndNeverCausesBlindSecondDispatch(String outcome) throws Exception {
        reports("PAID", 0);
        payments.verify(uid, ownerId);
        var response = json.readValue("{\"cancellation\":{\"id\":\"test-cancel\",\"status\":\"" + outcome
                + "\",\"totalAmount\":1000}}", PortoneV2CancelResponse.class);
        when(pg.cancelPayment(eq(uid), eq(1000), anyString(), anyString())).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            assertThat(attempt().getRefundDispatchedAt()).isNotNull();
            return response;
        });
        payments.cancel(adId, ownerId);
        assertThat(adStatus()).isEqualTo(AdStatus.REFUND_PENDING);
        assertThat(attempt().getRefundKey()).isNotBlank();
        payments.cancel(adId, ownerId);
        payments.reconcile(uid, null);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(1000), anyString(), anyString());
        assertThat(lifecycle.inspectStore(storeId).canClose()).isFalse();
        reports("CANCELLED", 1000);
        payments.reconcile(uid, null);
        assertThat(adStatus()).isEqualTo(AdStatus.REFUNDED);
        assertThat(lifecycle.inspectStore(storeId).canClose()).isTrue();
        // 재환불이 가능한 상태로 회귀하지 않는다.
        reports("PAID", 0);
        payments.reconcile(uid, null);
        payments.reconcile(uid, null);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(1000), anyString(), anyString());
    }

    @Test void timeoutAndPartialRefundRemainInTheQueueUntilExactFullCancellation() throws Exception {
        reports("PAID", 0);
        when(pg.cancelPayment(eq(uid), any(), anyString(), anyString())).thenThrow(new RuntimeException("timeout"));
        payments.cancel(adId, ownerId);
        reports("CANCELLED", 500);
        payments.reconcile(uid, null);
        assertThat(adStatus()).isNotEqualTo(AdStatus.REFUNDED);
        assertThat(attempt().getIssueCode()).isEqualTo("PG_STATE_OR_CANCELLED_AMOUNT_UNCERTAIN");
        reports("PAID", 0);
        payments.reconcile(uid, null);
        verify(pg, times(1)).cancelPayment(eq(uid), any(), anyString(), anyString());
    }

    @Test void cancellationBeforePaymentRemainsUnresolvedAndLatePaidUsesTheSavedIntent() throws Exception {
        reports("READY", 0);
        payments.cancel(adId, ownerId);
        assertThat(adStatus()).isEqualTo(AdStatus.CANCELLED);
        assertThat(attempt().getIssueCode()).isEqualTo("CANCELLED_BUT_PAYMENT_UNDECIDED");
        assertThat(lifecycle.inspectStore(storeId).canClose()).isFalse();
        reports("PAID", 0);
        payments.reconcile(uid, null);
        assertThat(adStatus()).isEqualTo(AdStatus.REFUND_PENDING);
        verify(pg, times(1)).cancelPayment(eq(uid), eq(1000), anyString(), anyString());
    }

    @Test void parallelCallbacksShareOneLeaseWhileNoDatabaseTransactionWaitsOnPg() throws Exception {
        var paid = payment(uid, "PAID", 0);
        CountDownLatch entered = new CountDownLatch(1), release = new CountDownLatch(1);
        when(pg.getPaymentInfo(uid)).thenAnswer(call -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
            entered.countDown();
            if (!release.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("test timeout");
            return paid;
        });
        try (var pool = Executors.newSingleThreadExecutor()) {
            Future<Boolean> first = pool.submit(() -> payments.reconcile(uid, null));
            try {
                assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
                assertThat(payments.reconcile(uid, null)).isFalse();
            } finally { release.countDown(); }
            assertThat(first.get(10, TimeUnit.SECONDS)).isTrue();
        }
        verify(pg, times(1)).getPaymentInfo(uid);
    }

    @Test void legacyRefundedFlagAndExternalPendingCancellationNeverTriggerANewRefund() throws Exception {
        tx.executeWithoutResult(ignored -> {
            attempts.deleteAll(attempts.findByAdIdOrderByIdAsc(adId));
            em.find(Advertisement.class, adId).setStatus(AdStatus.REFUNDED);
        });
        assertThat(lifecycle.inspectStore(storeId).canClose()).isFalse();
        ledger.importLegacy(adId);
        reports("PAID", 0);
        payments.cancel(adId, ownerId);
        assertThat(attempt().getIssueCode()).isEqualTo("PAID_AFTER_CONFIRMED_REFUND");
        verify(pg, never()).cancelPayment(anyString(), any(), anyString(), anyString());
    }

    @Test void staleWorkerCannotApplyAfterAnotherWorkerTakesItsLease() throws Exception {
        var first = ledger.claim(uid, ownerId);
        tx.executeWithoutResult(ignored -> em.createQuery("UPDATE AdPaymentAttempt p SET p.leaseUntil = :past WHERE p.merchantUid = :uid")
                .setParameter("past", java.time.LocalDateTime.now().minusMinutes(1)).setParameter("uid", uid).executeUpdate());
        var second = ledger.claim(uid, ownerId);
        ledger.applyPayment(first, payment(uid, "PAID", 0));
        assertThat(adStatus()).isEqualTo(AdStatus.PENDING_PAYMENT);
        ledger.applyPayment(second, payment(uid, "PAID", 0));
        assertThat(adStatus()).isEqualTo(AdStatus.ACTIVE);
    }

    @Test void crashAfterRefundDispatchIsRecoveredByReadWithoutAnotherPost() throws Exception {
        ledger.requestOwnerCancellation(adId, ownerId);
        var claim = ledger.claim(uid, ownerId);
        var command = ledger.applyPayment(claim, payment(uid, "PAID", 0));
        assertThat(command).isNotNull();
        // PG 취소 후 결과 저장 전에 프로세스가 끝난 상황: 발신 원장만 남는다.
        tx.executeWithoutResult(ignored -> em.createQuery("UPDATE AdPaymentAttempt p SET p.leaseUntil = :past WHERE p.merchantUid = :uid")
                .setParameter("past", java.time.LocalDateTime.now().minusMinutes(1)).setParameter("uid", uid).executeUpdate());
        reports("CANCELLED", 1000);
        payments.reconcile(uid, null);
        assertThat(attempt().getState()).isEqualTo(AdPaymentAttempt.State.REFUNDED);
        verify(pg, never()).cancelPayment(anyString(), any(), anyString(), anyString());
    }

    @Test void queuedPaidCannotRegressToFailedAndPermitAnotherPayment() throws Exception {
        tx.executeWithoutResult(ignored -> em.find(Advertisement.class, adId).setStatus(AdStatus.CANCELLED));
        reports("PAID", 0);
        payments.reconcile(uid, null);
        assertThat(attempt().isEverPaid()).isTrue();
        reports("FAILED", 0);
        payments.reconcile(uid, null);
        assertThat(attempt().getState()).isEqualTo(AdPaymentAttempt.State.REVIEW_REQUIRED);
        assertThatThrownBy(() -> payments.prepare(adId, ownerId)).isInstanceOf(AdvertisementException.class);
        assertThat(attempts.findByAdIdOrderByIdAsc(adId)).hasSize(1);
    }

    @Test void anExternalRequestedCancellationIsNotDuplicated() throws Exception {
        var external = json.readValue("{\"id\":\"" + uid + "\",\"status\":\"PAID\",\"currency\":\"KRW\","
                + "\"amount\":{\"total\":1000,\"cancelled\":0},\"cancellations\":[{\"id\":\"external\",\"status\":\"REQUESTED\"}]}",
                PortoneV2PaymentResponse.class);
        when(pg.getPaymentInfo(uid)).thenReturn(external);
        payments.cancel(adId, ownerId);
        assertThat(attempt().getIssueCode()).isEqualTo("PG_CANCELLATION_UNSETTLED");
        verify(pg, never()).cancelPayment(anyString(), any(), anyString(), anyString());
    }
}
