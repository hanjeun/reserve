package kr.it.reserve.payment;

import kr.it.reserve.payment.repository.PaymentWebhookInboxRepository;
import kr.it.reserve.payment.service.PaymentWebhookInboxStateService;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class PaymentWebhookInboxFailureContractTest {
    private static final String MISSING_WEBHOOK_ID = "missing-contract-webhook";

    private final PaymentWebhookInboxRepository inbox = mock(PaymentWebhookInboxRepository.class);
    private final PaymentWebhookInboxStateService state = new PaymentWebhookInboxStateService(inbox);

    @ParameterizedTest(name = "{0} rejects a missing inbox row without recreating or changing it")
    @EnumSource(RequiredOperation.class)
    void missingRowFailsAfterOnlyTheRequiredLookup(RequiredOperation operation) {
        boolean lockingLookup = operation != RequiredOperation.GET_REQUIRED;
        if (lockingLookup) {
            when(inbox.findByWebhookIdForUpdate(MISSING_WEBHOOK_ID)).thenReturn(Optional.empty());
        } else {
            when(inbox.findByWebhookId(MISSING_WEBHOOK_ID)).thenReturn(Optional.empty());
        }

        ThrowingCallable action = switch (operation) {
            case GET_REQUIRED -> () -> state.getRequired(MISSING_WEBHOOK_ID);
            case CLAIM -> () -> state.claim(MISSING_WEBHOOK_ID);
            case FORCE_CLAIM -> () -> state.forceClaim(MISSING_WEBHOOK_ID);
            case MARK_PROCESSED -> () -> state.markProcessed(MISSING_WEBHOOK_ID);
            case MARK_IGNORED -> () -> state.markIgnored(MISSING_WEBHOOK_ID);
            case MARK_FAILED -> () -> state.markFailed(MISSING_WEBHOOK_ID, "CONTRACT_FAILURE");
        };
        assertThatThrownBy(action).isExactlyInstanceOf(IllegalStateException.class)
                .hasMessage("Webhook inbox row not found");

        if (lockingLookup) {
            verify(inbox).findByWebhookIdForUpdate(MISSING_WEBHOOK_ID);
        } else {
            verify(inbox).findByWebhookId(MISSING_WEBHOOK_ID);
        }
        verifyNoMoreInteractions(inbox);
    }

    private enum RequiredOperation {
        GET_REQUIRED,
        CLAIM,
        FORCE_CLAIM,
        MARK_PROCESSED,
        MARK_IGNORED,
        MARK_FAILED
    }
}
