package kr.it.reserve.global.admission;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** Initial thresholds, not measured throughput feedback. Redis owns continuity and the writer lease. */
@Slf4j
@Component
public class ServiceAdmissionAutomaticPolicy {
    public enum Signal { HIGH, CLEAR, HOLD, UNKNOWN }
    private final ServiceAdmissionProperties properties;
    private final ServiceAdmissionLoadSampler sampler;
    private final ServiceAdmissionService service;
    private final String owner = UUID.randomUUID().toString();

    public ServiceAdmissionAutomaticPolicy(ServiceAdmissionProperties properties, ServiceAdmissionLoadSampler sampler,
                                            ServiceAdmissionService service) {
        this.properties = properties;
        this.sampler = sampler;
        this.service = service;
    }

    @Scheduled(fixedDelay = 5000, initialDelay = 5000)
    public void observe() {
        if (!properties.isEnabled() || !properties.getAutomatic().isEnabled()) return;
        ServiceAdmissionLoadSampler.Sample sample;
        try { sample = sampler.sample(); }
        catch (RuntimeException unavailable) { sample = ServiceAdmissionLoadSampler.Sample.unknown(); }
        try { service.observeAutomatic(owner, classify(sample, properties.getAutomatic())); }
        catch (RuntimeException unavailable) {
            // No stale mode fallback and no credentials, raw observations, or Redis connection data in logs.
            log.warn("Automatic service admission observation unavailable: errorType={}", unavailable.getClass().getSimpleName());
        }
    }

    static Signal classify(ServiceAdmissionLoadSampler.Sample sample, ServiceAdmissionProperties.Automatic policy) {
        if (sample == null) return Signal.UNKNOWN;
        boolean memoryKnown = sample.availableBytes() >= 0;
        boolean cpuKnown = Double.isFinite(sample.cpuLoad()) && sample.cpuLoad() >= 0 && sample.cpuLoad() <= 1;
        boolean heapKnown = Double.isFinite(sample.heapRatio()) && sample.heapRatio() >= 0 && sample.heapRatio() <= 1;
        if ((memoryKnown && sample.availableBytes() < policy.getMemoryPressureMib() * 1024L * 1024)
                || (cpuKnown && sample.cpuLoad() * 100 >= policy.getCpuPressurePercent())
                || (heapKnown && sample.heapRatio() * 100 >= policy.getHeapPressurePercent())) return Signal.HIGH;
        if (!memoryKnown || !cpuKnown || !heapKnown) return Signal.UNKNOWN;
        return sample.availableBytes() > policy.getMemoryClearMib() * 1024L * 1024
                && sample.cpuLoad() * 100 <= policy.getCpuClearPercent()
                && sample.heapRatio() * 100 <= policy.getHeapClearPercent() ? Signal.CLEAR : Signal.HOLD;
    }
}
