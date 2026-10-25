package kr.it.reserve.global.admission;

import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** 초기 임계값을 사용하며 실측 처리량의 피드백 제어는 아니다. Redis가 연속성과 쓰기 소유권을 관리한다. */
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
            // 이전 모드로 복귀하지 않으며 자격증명·원본 관측값·Redis 접속 정보는 기록하지 않는다.
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
