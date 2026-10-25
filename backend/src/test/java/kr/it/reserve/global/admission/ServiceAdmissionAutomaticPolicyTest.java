package kr.it.reserve.global.admission;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static kr.it.reserve.global.admission.ServiceAdmissionAutomaticPolicy.Signal.*;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ServiceAdmissionAutomaticPolicyTest {
    private final ServiceAdmissionProperties properties = new ServiceAdmissionProperties();
    private final ServiceAdmissionLoadSampler sampler = mock(ServiceAdmissionLoadSampler.class);
    private final ServiceAdmissionService service = mock(ServiceAdmissionService.class);
    private ServiceAdmissionAutomaticPolicy policy;

    @BeforeEach
    void prepare() { policy = new ServiceAdmissionAutomaticPolicy(properties, sampler, service); }

    @Test
    void eitherDisabledSwitchSkipsAllSamplingAndRedisPolicyCalls() {
        properties.getAutomatic().setEnabled(true);
        policy.observe();
        properties.setEnabled(true);
        properties.getAutomatic().setEnabled(false);
        policy.observe();
        verifyNoInteractions(sampler, service);
    }

    @ParameterizedTest
    @CsvSource({"127,0.1,0.5,HIGH", "300,0.90,0.5,HIGH", "300,0.5,0.90,HIGH",
            "257,0.65,0.75,CLEAR", "256,0.65,0.75,HOLD", "300,0.66,0.5,HOLD",
            "-1,0.1,0.5,UNKNOWN"})
    void thresholdsHaveARealHysteresisBand(long mib, double cpu, double heap, String expected) {
        var sample = new ServiceAdmissionLoadSampler.Sample(mib < 0 ? -1 : mib * 1024 * 1024, cpu, heap);
        assertThat(ServiceAdmissionAutomaticPolicy.classify(sample, properties.getAutomatic()).name()).isEqualTo(expected);
    }

    @Test
    void anUnknownMetricCannotClearProtectionButAnotherObservedDangerCanRaiseIt() {
        assertThat(ServiceAdmissionAutomaticPolicy.classify(
                new ServiceAdmissionLoadSampler.Sample(300L * 1024 * 1024, Double.NaN, 0.5), properties.getAutomatic())).isEqualTo(UNKNOWN);
        assertThat(ServiceAdmissionAutomaticPolicy.classify(
                new ServiceAdmissionLoadSampler.Sample(-1, Double.NaN, 0.95), properties.getAutomatic())).isEqualTo(HIGH);
    }

    @Test
    void sampleFailureIsAnUnknownObservationRatherThanSilentlyContinuingARecoveryStreak() {
        properties.setEnabled(true);
        properties.getAutomatic().setEnabled(true);
        when(sampler.sample()).thenThrow(new IllegalStateException("Synthetic unavailable observation"));
        policy.observe();
        verify(service).observeAutomatic(matches("[0-9a-f-]{36}"), eq(UNKNOWN));
    }

    @ParameterizedTest
    @ValueSource(strings = {"memory", "cpu", "heap", "pressure", "recovery", "minimum"})
    void invalidEnabledAutomaticConfigurationIsRejected(String field) {
        properties.setEnabled(true);
        properties.setEpoch("synthetic-entry-generation-01");
        var p = properties.getAutomatic();
        p.setEnabled(true);
        switch (field) {
            case "memory" -> p.setMemoryClearMib(p.getMemoryPressureMib());
            case "cpu" -> p.setCpuClearPercent(p.getCpuPressurePercent());
            case "heap" -> p.setHeapClearPercent(p.getHeapPressurePercent());
            case "pressure" -> p.setPressureSeconds(29);
            case "recovery" -> p.setRecoverySeconds(119);
            case "minimum" -> p.setMinimumEmergencySeconds(119);
        }
        assertThatThrownBy(properties::validate).isInstanceOf(IllegalArgumentException.class);
    }
}
