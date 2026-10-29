package kr.it.reserve.payment;

import kr.it.reserve.payment.controller.TestSettlementController;
import kr.it.reserve.payment.service.TestSettlementService;
import kr.it.reserve.global.error.PaymentException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class TestSettlementAvailabilityTest {
    @Test void disabledFeatureReportsPreparationAndStillBlocksFinancialActions() {
        var service = new TestSettlementService(null, null, null, null, null, null, null, null, null, null);
        ReflectionTestUtils.setField(service, "enabled", false);
        var controller = new TestSettlementController(service);
        assertThat(service.isEnabled()).isFalse();
        assertThatThrownBy(() -> service.page(1L, null, 0)).isInstanceOf(PaymentException.class)
                .hasMessage("가상 정산을 준비하고 있어요.");
        assertThatThrownBy(() -> service.simulate(1L, 1L, "invalid", null)).isInstanceOf(PaymentException.class);
        assertThat(controller.status().getData().enabled()).isFalse();
    }
    @Test void availabilityDoesNotQueryPayments() {
        var service = mock(TestSettlementService.class);
        when(service.isEnabled()).thenReturn(true);
        var controller = new TestSettlementController(service);
        assertThat(controller.status().getData().enabled()).isTrue();
        verify(service).isEnabled();
        verifyNoMoreInteractions(service);
    }
}
