package kr.it.reserve.global.admission;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.*;

class ServiceAdmissionLoadSamplerTest {
    @TempDir Path temporary;

    @Test
    void onlyAvailablePhysicalRamIsSampledAndInvalidMetricsRemainUnknown() throws Exception {
        var fixture = temporary.resolve("meminfo");
        Files.writeString(fixture, "MemTotal: 1951772 kB\nMemAvailable: 488172 kB\nSwapFree: 4194304 kB\n");
        var sample = new ServiceAdmissionLoadSampler(fixture, () -> -1, () -> 0.5).sample();
        assertThat(sample.availableBytes()).isEqualTo(488172L * 1024);
        assertThat(sample.cpuLoad()).isNaN();
        assertThat(sample.heapRatio()).isEqualTo(0.5);
    }

    @Test
    void boundedMissingOrAmbiguousHostReadCannotBecomeAHealthySample() throws Exception {
        var fixture = temporary.resolve("meminfo");
        assertThat(ServiceAdmissionLoadSampler.availableBytes(fixture)).isNegative();
        Files.writeString(fixture, "MemTotal: 1951772 kB\nMemFree: 1800000 kB\n");
        assertThat(ServiceAdmissionLoadSampler.availableBytes(fixture)).isNegative();
        Files.writeString(fixture, "MemTotal: 1951772 kB\nMemAvailable: 100 kB\nMemAvailable: 200 kB\n");
        assertThat(ServiceAdmissionLoadSampler.availableBytes(fixture)).isNegative();
        Files.writeString(fixture, "x".repeat(8193));
        assertThat(ServiceAdmissionLoadSampler.availableBytes(fixture)).isNegative();
        var sample = new ServiceAdmissionLoadSampler(fixture, () -> { throw new IllegalStateException(); }, () -> Double.POSITIVE_INFINITY).sample();
        assertThat(sample.availableBytes()).isNegative();
        assertThat(sample.cpuLoad()).isNaN();
        assertThat(sample.heapRatio()).isNaN();
    }
}
