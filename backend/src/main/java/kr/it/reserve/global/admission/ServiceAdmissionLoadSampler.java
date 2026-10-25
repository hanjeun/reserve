package kr.it.reserve.global.admission;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.function.DoubleSupplier;
import java.util.regex.Pattern;

/** 프로세스 실행·DB 조회·원격 요청 없이 로컬 관측값만 수집한다. */
@Component
public class ServiceAdmissionLoadSampler {
    public record Sample(long availableBytes, double cpuLoad, double heapRatio) {
        static Sample unknown() { return new Sample(-1, Double.NaN, Double.NaN); }
    }

    private static final int MAX_MEMINFO_BYTES = 8192;
    private static final Pattern MEMORY = Pattern.compile("^(MemTotal|MemAvailable):\\s+([0-9]+)\\s+kB\\s*$");
    private final Path meminfo;
    private final DoubleSupplier cpu;
    private final DoubleSupplier heap;

    public ServiceAdmissionLoadSampler() {
        this(Path.of("/proc/meminfo"), ServiceAdmissionLoadSampler::cpuLoad, ServiceAdmissionLoadSampler::heapRatio);
    }

    ServiceAdmissionLoadSampler(Path meminfo, DoubleSupplier cpu, DoubleSupplier heap) {
        this.meminfo = meminfo;
        this.cpu = cpu;
        this.heap = heap;
    }

    public Sample sample() {
        return new Sample(availableBytes(meminfo), metric(cpu), metric(heap));
    }

    private static double metric(DoubleSupplier metric) {
        try {
            double value = metric.getAsDouble();
            return Double.isFinite(value) && value >= 0 && value <= 1 ? value : Double.NaN;
        } catch (RuntimeException unavailable) { return Double.NaN; }
    }

    static long availableBytes(Path path) {
        try (var input = Files.newInputStream(path)) {
            byte[] bytes = input.readNBytes(MAX_MEMINFO_BYTES + 1);
            if (bytes.length > MAX_MEMINFO_BYTES) return -1;
            long total = -1, available = -1;
            for (String line : new String(bytes, StandardCharsets.US_ASCII).split("\n")) {
                if (!line.startsWith("MemTotal:") && !line.startsWith("MemAvailable:")) continue;
                var match = MEMORY.matcher(line);
                if (!match.matches()) return -1;
                long value = Math.multiplyExact(Long.parseLong(match.group(2)), 1024);
                if ("MemTotal".equals(match.group(1))) {
                    if (total != -1) return -1;
                    total = value;
                } else {
                    if (available != -1) return -1;
                    available = value;
                }
            }
            return total > 0 && available >= 0 && available <= total ? available : -1;
        } catch (IOException | RuntimeException unavailable) { return -1; }
    }

    private static double cpuLoad() {
        var os = ManagementFactory.getOperatingSystemMXBean();
        return os instanceof com.sun.management.OperatingSystemMXBean cpu ? cpu.getCpuLoad() : Double.NaN;
    }

    private static double heapRatio() {
        var memory = ManagementFactory.getMemoryMXBean().getHeapMemoryUsage();
        return memory.getMax() > 0 ? (double) memory.getUsed() / memory.getMax() : Double.NaN;
    }
}
