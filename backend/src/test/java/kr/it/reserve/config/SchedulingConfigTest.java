package kr.it.reserve.config;

import kr.it.reserve.reservation.repository.ReservationRepository;
import kr.it.reserve.reservation.service.ReservationCodeBackfillRunner;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class SchedulingConfigTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(SchedulingConfig.class, ReservationCodeBackfillRunner.class)
            .withBean(ReservationRepository.class, () -> mock(ReservationRepository.class));

    @Test void ordinaryStartupKeepsSchedulingAndBackfillEnabled() {
        context.run(application -> {
            assertThat(application).hasSingleBean(ScheduledAnnotationBeanPostProcessor.class);
            assertThat(application).hasSingleBean(ReservationCodeBackfillRunner.class);
        });
    }

    @Test void explicitStartupIsolationRegistersNeitherSchedulerNorBackfill() {
        context.withPropertyValues("reserve.scheduling.enabled=false", "reservation.code-backfill.enabled=false")
                .run(application -> {
                    assertThat(application).doesNotHaveBean(ScheduledAnnotationBeanPostProcessor.class);
                    assertThat(application).doesNotHaveBean(ReservationCodeBackfillRunner.class);
                });
    }

    @Test void backgroundSwitchesRemainIndependent() {
        context.withPropertyValues("reserve.scheduling.enabled=false").run(application -> {
            assertThat(application).doesNotHaveBean(ScheduledAnnotationBeanPostProcessor.class);
            assertThat(application).hasSingleBean(ReservationCodeBackfillRunner.class);
        });
        context.withPropertyValues("reservation.code-backfill.enabled=false").run(application -> {
            assertThat(application).hasSingleBean(ScheduledAnnotationBeanPostProcessor.class);
            assertThat(application).doesNotHaveBean(ReservationCodeBackfillRunner.class);
        });
    }
}
