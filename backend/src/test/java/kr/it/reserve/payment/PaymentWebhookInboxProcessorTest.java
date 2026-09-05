package kr.it.reserve.payment;

import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.payment.dto.PortoneWebhookSignal;
import kr.it.reserve.payment.entity.PaymentWebhookInbox;
import kr.it.reserve.payment.service.PaymentWebhookInboxProcessor;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService.InboxSnapshot;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService.InboxWork;
import kr.it.reserve.payment.service.PortoneWebhookService;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PaymentWebhookInboxProcessorTest {

    private static final String WEBHOOK_ID = "msg_01_INBOX";
    private static final String MERCHANT_UID = "reserve-20260901-0001";
    private static final String BODY = "{\"type\":\"Transaction.Paid\",\"data\":{\"paymentId\":\"reserve-20260901-0001\"}}";

    @Mock private PaymentWebhookInboxStateService inboxStateService;
    @Mock private PortoneWebhookService webhookService;

    @InjectMocks
    private PaymentWebhookInboxProcessor processor;

    @Test
    @DisplayName("PG 조회보다 durable inbox 등록이 먼저 일어난다")
    void inboxIsCommittedBeforePgLookup() {
        when(webhookService.parseSignal(BODY))
                .thenReturn(new PortoneWebhookSignal("Transaction.Paid", MERCHANT_UID, true));
        when(inboxStateService.register(
                org.mockito.ArgumentMatchers.eq(WEBHOOK_ID),
                org.mockito.ArgumentMatchers.eq("Transaction.Paid"),
                org.mockito.ArgumentMatchers.eq(MERCHANT_UID),
                anyString()))
                .thenAnswer(invocation -> new InboxSnapshot(
                        WEBHOOK_ID,
                        invocation.getArgument(3),
                        PaymentWebhookInbox.InboxStatus.RECEIVED));
        when(inboxStateService.claim(WEBHOOK_ID))
                .thenReturn(Optional.of(new InboxWork(WEBHOOK_ID, MERCHANT_UID)));

        processor.receive(WEBHOOK_ID, BODY);

        InOrder order = inOrder(inboxStateService, webhookService);
        order.verify(inboxStateService).register(
                org.mockito.ArgumentMatchers.eq(WEBHOOK_ID),
                org.mockito.ArgumentMatchers.eq("Transaction.Paid"),
                org.mockito.ArgumentMatchers.eq(MERCHANT_UID),
                anyString());
        order.verify(inboxStateService).claim(WEBHOOK_ID);
        order.verify(webhookService).processMerchantUid(MERCHANT_UID);
        order.verify(inboxStateService).markProcessed(WEBHOOK_ID);
    }

    @Test
    @DisplayName("처리 실패는 inbox에 남고 예외를 다시 던져 PortOne 재전송을 유도한다")
    void processingFailureIsPersistedAndRethrown() {
        when(webhookService.parseSignal(BODY))
                .thenReturn(new PortoneWebhookSignal("Transaction.Paid", MERCHANT_UID, true));
        when(inboxStateService.register(anyString(), anyString(), anyString(), anyString()))
                .thenAnswer(invocation -> new InboxSnapshot(
                        WEBHOOK_ID,
                        invocation.getArgument(3),
                        PaymentWebhookInbox.InboxStatus.RECEIVED));
        when(inboxStateService.claim(WEBHOOK_ID))
                .thenReturn(Optional.of(new InboxWork(WEBHOOK_ID, MERCHANT_UID)));
        org.mockito.Mockito.doThrow(new PaymentException("temporary", HttpStatus.INTERNAL_SERVER_ERROR))
                .when(webhookService).processMerchantUid(MERCHANT_UID);

        assertThatThrownBy(() -> processor.receive(WEBHOOK_ID, BODY))
                .isInstanceOf(PaymentException.class);

        verify(inboxStateService).markFailed(WEBHOOK_ID, "PaymentException");
        verify(inboxStateService, never()).markProcessed(WEBHOOK_ID);
    }

    @Test
    @DisplayName("결제 ID가 없는 이벤트도 inbox에 기록한 뒤 IGNORED로 닫는다")
    void eventWithoutPaymentIdIsRecordedAndIgnored() {
        String body = "{\"type\":\"BillingKey.Issued\",\"data\":{\"billingKey\":\"bk-1\"}}";
        when(webhookService.parseSignal(body))
                .thenReturn(new PortoneWebhookSignal("BillingKey.Issued", null, true));
        when(inboxStateService.register(
                org.mockito.ArgumentMatchers.eq(WEBHOOK_ID),
                org.mockito.ArgumentMatchers.eq("BillingKey.Issued"),
                org.mockito.ArgumentMatchers.isNull(),
                anyString()))
                .thenAnswer(invocation -> new InboxSnapshot(
                        WEBHOOK_ID,
                        invocation.getArgument(3),
                        PaymentWebhookInbox.InboxStatus.RECEIVED));
        when(inboxStateService.claim(WEBHOOK_ID))
                .thenReturn(Optional.of(new InboxWork(WEBHOOK_ID, null)));

        processor.receive(WEBHOOK_ID, body);

        verify(inboxStateService).markIgnored(WEBHOOK_ID);
        verify(webhookService, never()).processMerchantUid(anyString());
    }

    @Test
    @DisplayName("관리자 즉시 재처리는 backoff용 claim 대신 force claim을 사용한다")
    void manualRetryBypassesBackoffGate() {
        when(inboxStateService.forceClaim(WEBHOOK_ID))
                .thenReturn(Optional.of(new InboxWork(WEBHOOK_ID, MERCHANT_UID)));

        processor.retryNow(WEBHOOK_ID);

        verify(inboxStateService).forceClaim(WEBHOOK_ID);
        verify(inboxStateService, never()).claim(WEBHOOK_ID);
        verify(webhookService).processMerchantUid(MERCHANT_UID);
        verify(inboxStateService).markProcessed(WEBHOOK_ID);
    }
}
