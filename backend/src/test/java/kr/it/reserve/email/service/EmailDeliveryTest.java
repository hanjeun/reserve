package kr.it.reserve.email.service;

import kr.it.reserve.global.error.EmailException;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import java.util.concurrent.CompletableFuture;
import static org.assertj.core.api.Assertions.*;

class EmailDeliveryTest {
    @org.springframework.boot.test.context.TestConfiguration(proxyBeanMethods = false)
    @org.springframework.scheduling.annotation.EnableAsync(proxyTargetClass = true)
    static class MailFixture {
        @org.springframework.context.annotation.Bean
        org.springframework.mail.javamail.JavaMailSender sender() { return org.mockito.Mockito.mock(org.springframework.mail.javamail.JavaMailSender.class); }
        @org.springframework.context.annotation.Bean
        EmailService service(org.springframework.mail.javamail.JavaMailSender sender) { return new EmailService(sender); }
        @org.springframework.context.annotation.Bean(name = "mailExecutor", destroyMethod = "shutdown")
        org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor executor() {
            var executor = new org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor();
            executor.setCorePoolSize(1); executor.setMaxPoolSize(1); executor.setQueueCapacity(1); executor.setThreadNamePrefix("synthetic-mail-");
            return executor;
        }
    }
    @Test void realAsyncProxyPropagatesMockSmtpFailureToTheAcknowledgement() {
        try (var context = new org.springframework.context.annotation.AnnotationConfigApplicationContext()) {
            context.getEnvironment().getPropertySources().addFirst(new org.springframework.core.env.MapPropertySource("synthetic-mail",
                    java.util.Map.of("mail.username", "sender@example.test", "mail.from", "sender@example.test", "mail.from-name", "합성 발신")));
            context.register(MailFixture.class); context.refresh();
            var sender = context.getBean(org.springframework.mail.javamail.JavaMailSender.class);
            org.mockito.Mockito.when(sender.createMimeMessage()).thenAnswer(ignored -> new jakarta.mail.internet.MimeMessage(jakarta.mail.Session.getInstance(new java.util.Properties())));
            var worker = new java.util.concurrent.atomic.AtomicReference<String>();
            org.mockito.Mockito.doAnswer(ignored -> {
                worker.set(Thread.currentThread().getName());
                throw new org.springframework.mail.MailSendException("synthetic-private-provider-detail");
            }).when(sender).send(org.mockito.ArgumentMatchers.any(jakarta.mail.internet.MimeMessage.class));
            var service = context.getBean(EmailService.class);
            assertThatThrownBy(() -> EmailDelivery.await(EmailDelivery.submit(() -> service.sendRiskLoginVerificationEmail("member@example.test", "123456"))))
                    .isInstanceOf(EmailException.class).hasMessageNotContaining("synthetic-private-provider-detail");
            assertThat(worker.get()).startsWith("synthetic-mail-");
        }
    }
    @Test void completedSmtpRequestAcknowledgesWithoutPromisingMailboxDelivery() {
        assertThatCode(() -> EmailDelivery.await(CompletableFuture.completedFuture(null))).doesNotThrowAnyException();
    }
    @Test void asynchronousFailureAndQueueRejectionStayVisibleWithoutProviderDetails() {
        var failure = catchThrowableOfType(() -> EmailDelivery.await(CompletableFuture.failedFuture(new IllegalStateException("synthetic-provider-details"))),
                EmailException.class);
        assertThat(failure.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(failure).hasMessageNotContaining("synthetic-provider-details");
        assertThatThrownBy(() -> EmailDelivery.submit(() -> { throw new org.springframework.core.task.TaskRejectedException("synthetic-provider-details"); }))
                .isInstanceOf(EmailException.class).hasMessageNotContaining("synthetic-provider-details");
    }
    @Test void unknownCompletionDoesNotCancelALateMailOrReportItAsSent() {
        var delivery = new CompletableFuture<Void>();
        var failure = catchThrowableOfType(() -> EmailDelivery.await(delivery, 1), EmailException.class);
        assertThat(failure.getStatus()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
        assertThat(failure).hasMessageContaining("발송 상태를 확인하지 못했어요");
        assertThat(delivery.isCancelled()).isFalse();
        assertThat(delivery.complete(null)).isTrue();
    }
}
