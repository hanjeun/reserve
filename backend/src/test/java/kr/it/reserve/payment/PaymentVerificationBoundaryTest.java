package kr.it.reserve.payment;

import kr.it.reserve.global.error.PaymentException;
import kr.it.reserve.member.entity.Member;
import kr.it.reserve.payment.dto.PaymentResponseDto;
import kr.it.reserve.payment.dto.PaymentVerifyDto;
import kr.it.reserve.payment.dto.PortoneV2PaymentResponse;
import kr.it.reserve.payment.service.PaymentService;
import kr.it.reserve.payment.service.PaymentVerificationService;
import kr.it.reserve.payment.service.PortoneService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

@SpringJUnitConfig(PaymentVerificationBoundaryTest.Config.class)
class PaymentVerificationBoundaryTest {
    @Configuration
    @EnableTransactionManagement
    static class Config {
        @Bean PaymentService payments() { return mock(PaymentService.class); }
        @Bean PortoneService portone() { return mock(PortoneService.class); }
        @Bean PaymentVerificationService verification(PaymentService payments, PortoneService portone) {
            return new PaymentVerificationService(payments, portone);
        }
        @Bean PlatformTransactionManager transactionManager() {
            return new DataSourceTransactionManager(new DriverManagerDataSource("jdbc:h2:mem:verification-boundary", "sa", ""));
        }
    }
    @Autowired PaymentService payments;
    @Autowired PortoneService portone;
    @Autowired PaymentVerificationService verification;
    @Autowired PlatformTransactionManager transactions;
    @BeforeEach void resetMocks() { reset(payments, portone); }

    private PaymentVerifyDto request() {
        PaymentVerifyDto request = new PaymentVerifyDto(); request.setMerchantUid("order-test"); return request;
    }
    @Test void validatesOwnerBeforePgAndPerformsLookupWithoutTransaction() {
        Member member = Member.builder().id(12L).build();
        when(payments.prepareVerification("order-test", 12L))
                .thenReturn(new PaymentService.VerificationSnapshot("order-test", null));
        PortoneV2PaymentResponse pg = mock(PortoneV2PaymentResponse.class);
        when(portone.getPaymentInfo("order-test")).thenAnswer(ignored -> {
            assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse(); return pg;
        });
        verification.verifyByMember(request(), member);
        var order = inOrder(payments, portone);
        order.verify(payments).prepareVerification("order-test", 12L);
        order.verify(portone).getPaymentInfo("order-test");
        order.verify(payments).completeReadyPaymentFromPg("order-test", pg, null);
    }
    @Test void rejectsExistingTransactionBeforeAnyDatabaseOrPgWork() {
        assertThatThrownBy(() -> new TransactionTemplate(transactions).execute(status -> verification.verifyRedirect(request())))
                .isInstanceOf(IllegalTransactionStateException.class);
        verifyNoInteractions(payments, portone);
    }
    @Test void deniedOwnerAndAlreadyCompletedPaymentNeverCallPg() {
        when(payments.prepareVerification("order-test", 12L)).thenThrow(PaymentException.notFound());
        assertThatThrownBy(() -> verification.verifyByMember(request(), Member.builder().id(12L).build()))
                .isInstanceOf(PaymentException.class);
        PaymentResponseDto completed = mock(PaymentResponseDto.class);
        when(payments.prepareVerification("order-test", null))
                .thenReturn(new PaymentService.VerificationSnapshot("order-test", completed));
        assertThat(verification.verifyRedirect(request())).isSameAs(completed);
        verifyNoInteractions(portone);
    }
}
